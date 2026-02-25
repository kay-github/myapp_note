import { prisma } from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/config";
import { encryptText } from "@/lib/crypto";

export async function ensureDefaultSpace(): Promise<void> {
  const existing = await prisma.space.findUnique({
    where: { slug: APP_CONFIG.defaultSpaceSlug },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.space.create({
    data: {
      slug: APP_CONFIG.defaultSpaceSlug,
      title: APP_CONFIG.defaultSpaceTitle,
      note: { create: { content: encryptText("欢迎使用免登录临时笔记本。") } },
    },
  });
}
