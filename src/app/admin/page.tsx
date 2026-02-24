import Link from "next/link";
import { isAdminAuthed } from "@/lib/auth";
import { ensureDefaultSpace } from "@/lib/bootstrap";
import { prisma } from "@/lib/prisma";
import { AdminPanel } from "@/components/admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await ensureDefaultSpace();
  const authed = await isAdminAuthed();

  const spaces = await prisma.space.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      note: { select: { updatedAt: true } },
      assets: { select: { id: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <Link className="btn btn-ghost" href="/">
          返回首页
        </Link>
      </div>

      <AdminPanel
        authed={authed}
        spaces={spaces.map((space) => ({
          id: space.id,
          title: space.title,
          slug: space.slug,
          hasPassword: Boolean(space.passwordHash),
          assetCount: space.assets.length,
          updatedAt: new Date(space.note?.updatedAt || space.updatedAt).toISOString(),
        }))}
      />
    </main>
  );
}
