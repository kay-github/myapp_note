import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_NOTE_LENGTH } from "@/lib/config";
import { canWriteSpace } from "@/lib/space-permission";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";

const bodySchema = z.object({
  content: z.string().max(MAX_NOTE_LENGTH),
  // 客户端加载笔记时的 updatedAt，用于检测其他设备的并发修改；不传则跳过检测（兼容旧客户端）
  baseUpdatedAt: z.string().nullable().optional(),
  force: z.boolean().optional(),
});

type Context = { params: Promise<{ slug: string }> };

export async function PUT(req: Request, { params }: Context) {
  const { slug } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return new NextResponse("Invalid content", { status: 400 });
  }

  const space = await prisma.space.findUnique({ where: { slug } });
  if (!space) {
    return new NextResponse("Space not found", { status: 404 });
  }

  if (!(await canWriteSpace(space))) {
    return new NextResponse("Write permission required", { status: 401 });
  }

  if (!parsed.data.force && parsed.data.baseUpdatedAt !== undefined) {
    const existing = await prisma.note.findUnique({
      where: { spaceId: space.id },
      select: { updatedAt: true },
    });
    if (existing) {
      const base = parsed.data.baseUpdatedAt ? Date.parse(parsed.data.baseUpdatedAt) : Number.NaN;
      if (Number.isNaN(base) || existing.updatedAt.getTime() !== base) {
        return new NextResponse("Note was modified on another device", { status: 409 });
      }
    }
  }

  const saved = await prisma.note.upsert({
    where: { spaceId: space.id },
    create: {
      spaceId: space.id,
      content: encryptText(parsed.data.content),
    },
    update: {
      content: encryptText(parsed.data.content),
    },
    select: { updatedAt: true },
  });

  await writeAudit({
    action: "note_update",
    actor: "space",
    ip: await getClientIp(),
    spaceId: space.id,
  });

  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt.toISOString() });
}
