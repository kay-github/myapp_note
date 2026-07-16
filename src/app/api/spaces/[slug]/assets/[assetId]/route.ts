import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { canReadSpace, canWriteSpace } from "@/lib/space-permission";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { decryptBytes } from "@/lib/crypto";
import { BLOB_DOWNLOAD_URL_TTL_MS, presignBlobDownloadUrl } from "@/lib/blob-sign";

type Context = { params: Promise<{ slug: string; assetId: string }> };

// 老的代理下载：文件字节流经 serverless 函数中转，仅作为签名直链失败时的兜底
async function proxyBlobDownload(blobUrl: string, name: string, mimeType: string, size: number) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return new NextResponse("Blob token missing", { status: 500 });
  }

  const blobRes = await fetch(blobUrl, {
    headers: {
      Authorization: `Bearer ${blobToken}`,
    },
  });

  if (!blobRes.ok) {
    return new NextResponse("Failed to read blob", { status: 502 });
  }

  const contentType = blobRes.headers.get("content-type") || mimeType;
  const contentLength = blobRes.headers.get("content-length") || String(size);
  return new NextResponse(blobRes.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": contentLength,
      "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export async function GET(_: Request, { params }: Context) {
  const { slug, assetId } = await params;

  const space = await prisma.space.findUnique({ where: { slug } });
  if (!space) {
    return new NextResponse("Space not found", { status: 404 });
  }

  if (!(await canReadSpace(space))) {
    return new NextResponse("Read permission required", { status: 401 });
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, spaceId: space.id },
  });

  if (!asset) {
    return new NextResponse("Asset not found", { status: 404 });
  }

  if (asset.storage === "blob" && asset.blobUrl) {
    // 权限校验通过后签发短时效直链并 302 重定向，浏览器直接从 Blob CDN 下载，
    // 文件字节不再经过 serverless 函数中转，大文件下载明显更快
    const presignedUrl = await presignBlobDownloadUrl(asset.blobUrl);
    if (presignedUrl) {
      return NextResponse.redirect(presignedUrl, {
        status: 302,
        headers: {
          // 重定向本身只可短暂私有缓存，直链到期后需要重新签发
          "Cache-Control": `private, max-age=${Math.floor(BLOB_DOWNLOAD_URL_TTL_MS / 1000 / 2)}`,
        },
      });
    }

    // 签名直链不可用时回退到代理下载
    return proxyBlobDownload(asset.blobUrl, asset.name, asset.mimeType, asset.size);
  }

  if (!asset.data) {
    return new NextResponse("Asset payload missing", { status: 404 });
  }

  const payload = decryptBytes(asset.data);
  return new NextResponse(new Uint8Array(payload), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(payload.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(asset.name)}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(_: Request, { params }: Context) {
  const { slug, assetId } = await params;
  const space = await prisma.space.findUnique({ where: { slug } });
  if (!space) {
    return new NextResponse("Space not found", { status: 404 });
  }

  if (!(await canWriteSpace(space))) {
    return new NextResponse("Write permission required", { status: 401 });
  }

  const target = await prisma.asset.findFirst({
    where: { id: assetId, spaceId: space.id },
    select: { id: true, blobUrl: true, storage: true },
  });

  if (!target) {
    return new NextResponse("Asset not found", { status: 404 });
  }

  if (target.storage === "blob" && target.blobUrl) {
    try {
      await del(target.blobUrl);
    } catch {
      return new NextResponse("Failed to remove blob", { status: 500 });
    }
  }

  const deleted = await prisma.asset.deleteMany({
    where: { id: assetId, spaceId: space.id },
  });

  if (deleted.count === 0) {
    return new NextResponse("Asset not found", { status: 404 });
  }

  await writeAudit({
    action: "asset_delete",
    actor: "space",
    ip: await getClientIp(),
    spaceId: space.id,
    detail: assetId,
  });

  return NextResponse.json({ ok: true });
}
