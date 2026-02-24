import Link from "next/link";
import { ensureDefaultSpace } from "@/lib/bootstrap";
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
        <p className="text-sm font-medium text-[var(--ink-1)]">Quick Space</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">多设备临时传输空间</h1>
        <p className="mt-2 text-sm text-[var(--ink-1)]">
          所有空间均可阅读与复制，写入需要空间密码，管理操作需要超管密码。
        </p>
        <div className="mt-4">
          <Link className="btn btn-primary" href="/admin">
            进入管理台
          </Link>
        </div>
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
          </Link>
        ))}
      </section>
    </main>
  );
}
