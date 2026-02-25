import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canWriteSpace } from "@/lib/space-permission";
import { getClientIp } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { MAX_FILE_SIZE } from "@/lib/config";

const bodySchema = z.object({
  blobUrl: z.string().url(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
});

type Context = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Context) {
  const { slug } = await params;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const space = await prisma.space.findUnique({ where: { slug } });
  if (!space) {
    return new NextResponse("Space not found", { status: 404 });
  }

  if (!(await canWriteSpace(space))) {
    return new NextResponse("Write permission required", { status: 401 });
  }

  await prisma.asset.create({
    data: {
      spaceId: space.id,
      name: parsed.data.originalName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
      blobUrl: parsed.data.blobUrl,
      storage: "blob",
    },
  });

  await writeAudit({
    action: "asset_register_blob",
    actor: "space",
    ip: await getClientIp(),
    spaceId: space.id,
    detail: parsed.data.originalName,
  });

  return NextResponse.json({ ok: true });
}
