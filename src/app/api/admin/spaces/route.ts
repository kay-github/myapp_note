import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { APP_CONFIG } from "@/lib/config";
import { isAdminAuthed } from "@/lib/auth";
import { hashPassword } from "@/lib/hash";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request";

const slugPattern = /^[a-zA-Z0-9_-]{3,30}$/;

const createSchema = z.object({
  title: z.string().trim().min(1).max(60),
  slug: z.string().trim().regex(slugPattern),
  password: z.string().trim().min(1).max(40).optional(),
});

const updateSchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().trim().min(1).max(60).optional(),
  slug: z.string().trim().regex(slugPattern).optional(),
  password: z.string().trim().max(40).optional(),
});

const deleteSchema = z.object({
  spaceId: z.string().min(1),
});

async function ensureAdmin() {
  if (!(await isAdminAuthed())) {
    return new NextResponse("Admin auth required", { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const ip = await getClientIp();
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const payload = parsed.data;
  const passwordHash = payload.password ? await hashPassword(payload.password) : null;

  try {
    const space = await prisma.space.create({
      data: {
        title: payload.title,
        slug: payload.slug,
        passwordHash,
        note: { create: { content: "" } },
      },
    });

    await writeAudit({
      action: "admin_create_space",
      actor: "admin",
      ip,
      spaceId: space.id,
      detail: payload.slug,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new NextResponse("路径已被占用", { status: 409 });
    }
    return new NextResponse("Failed to create space", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const ip = await getClientIp();
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const payload = parsed.data;
  const updateData: Prisma.SpaceUpdateInput = {};

  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.slug !== undefined) updateData.slug = payload.slug;
  if (payload.password !== undefined) {
    updateData.passwordHash = payload.password ? await hashPassword(payload.password) : null;
  }

  if (Object.keys(updateData).length === 0) {
    return new NextResponse("No changes", { status: 400 });
  }

  try {
    const space = await prisma.space.update({
      where: { id: payload.spaceId },
      data: updateData,
      select: { id: true },
    });

    await writeAudit({
      action: "admin_update_space",
      actor: "admin",
      ip,
      spaceId: space.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new NextResponse("路径已被占用", { status: 409 });
    }
    return new NextResponse("Failed to update space", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const ip = await getClientIp();
  const parsed = deleteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const target = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    select: { slug: true, id: true },
  });

  if (!target) {
    return new NextResponse("Space not found", { status: 404 });
  }

  if (target.slug === APP_CONFIG.defaultSpaceSlug) {
    return new NextResponse("默认空间不可删除", { status: 400 });
  }

  await prisma.space.delete({ where: { id: target.id } });
  await writeAudit({
    action: "admin_delete_space",
    actor: "admin",
    ip,
    spaceId: target.id,
    detail: target.slug,
  });

  return NextResponse.json({ ok: true });
}
