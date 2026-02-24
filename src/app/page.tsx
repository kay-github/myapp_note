import Link from "next/link";
import { ensureDefaultSpace } from "@/lib/bootstrap";
import { APP_CONFIG } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureDefaultSpace();

  const spaces = await prisma.space.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      note: { select: { updatedAt: true } },
      assets: { select: { id: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="panel mb-5 p-5 sm:p-6">
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">免登录临时笔记本</h1>
        <p className="mt-2 text-sm text-[var(--ink-1)]">
          无需登录，输入密码即可访问笔记空间，笔记空间内所有内容可阅读/复制/下载。
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {spaces.map((space) => (
          <Link className="panel block p-4 transition hover:-translate-y-0.5" key={space.id} href={`/${space.slug}`}>
            <h2 className="text-lg font-semibold">{space.title}</h2>
            <p className="mt-1 font-mono text-xs text-[var(--ink-1)]">/{space.slug}</p>
            <p className="mt-3 text-sm text-[var(--ink-1)]">
              最近编辑：
              {new Date(space.note?.updatedAt || space.updatedAt).toLocaleString("zh-CN")}
            </p>
            <p className="mt-1 text-sm text-[var(--ink-1)]">附件数量：{space.assets.length}</p>
            <p className="mt-1 text-sm text-[var(--ink-1)]">
              {space.slug === APP_CONFIG.defaultSpaceSlug ? "公共空间：免密可读，编辑需密码" : "私有空间：输入密码后访问"}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}
