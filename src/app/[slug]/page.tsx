import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDefaultSpace } from "@/lib/bootstrap";
import { isAdminAuthed, canWriteWithSpaceCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SpaceView } from "@/components/space-view";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function SpacePage({ params }: Props) {
  const { slug } = await params;
  await ensureDefaultSpace();

  const space = await prisma.space.findUnique({
    where: { slug },
    include: {
      note: true,
      assets: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!space) {
    notFound();
  }

  const admin = await isAdminAuthed();
  const spaceWrite = admin || (await canWriteWithSpaceCookie(slug));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <Link className="btn btn-ghost" href="/">
          返回首页
        </Link>
        <Link className="btn btn-ghost" href="/admin">
          管理台
        </Link>
      </div>

      <SpaceView
        slug={space.slug}
        title={space.title}
        note={space.note?.content || ""}
        canWrite={spaceWrite}
        hasPassword={Boolean(space.passwordHash)}
        isAdmin={admin}
        assets={space.assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          mimeType: asset.mimeType,
          size: asset.size,
          createdAt: asset.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
