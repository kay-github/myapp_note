import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { canReadSpace, canWriteSpace } from "@/lib/space-permission";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { decryptBytes } from "@/lib/crypto";

type Context = { params: Promise<{ slug: string; assetId: string }> };

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
    return NextResponse.redirect(asset.blobUrl);
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
