import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDefaultSpace } from "@/lib/bootstrap";
import { APP_CONFIG } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { SpaceView } from "@/components/space-view";
import { canReadSpace, canWriteSpace } from "@/lib/space-permission";
import { decryptText } from "@/lib/crypto";

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

  const isPublicSpace = space.slug === APP_CONFIG.defaultSpaceSlug;
  const canRead = await canReadSpace(space);
  const canWrite = await canWriteSpace(space);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <Link className="btn btn-ghost" href="/">
          返回首页
        </Link>
      </div>

      <SpaceView
        slug={space.slug}
        title={space.title}
        note={canRead ? decryptText(space.note?.content || "") : ""}
        canRead={canRead}
        canWrite={canWrite}
        hasPassword={Boolean(space.passwordHash)}
        requiresEntryPassword={!isPublicSpace}
        isPublicSpace={isPublicSpace}
        assets={
          canRead
            ? space.assets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                mimeType: asset.mimeType,
                size: asset.size,
                createdAt: asset.createdAt.toISOString(),
              }))
            : []
        }
      />
    </main>
  );
}
