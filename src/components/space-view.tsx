"use client";

import { ClipboardEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { TopToast, ToastTone } from "@/components/top-toast";
import { upload } from "@vercel/blob/client";

type AssetItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type Props = {
  slug: string;
  title: string;
  note: string;
  canRead: boolean;
  canWrite: boolean;
  hasPassword: boolean;
  requiresEntryPassword: boolean;
  isPublicSpace: boolean;
  assets: AssetItem[];
};

function fmtSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function SpaceView({
  slug,
  title,
  note,
  canRead,
  canWrite,
  hasPassword,
  requiresEntryPassword,
  isPublicSpace,
  assets,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [showEditAuth, setShowEditAuth] = useState(false);

  useEffect(() => {
    setText(note);
  }, [note, slug]);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ message, tone });
  }, []);

  const images = useMemo(() => assets.filter((v) => v.mimeType.startsWith("image/")), [assets]);
  const videos = useMemo(() => assets.filter((v) => v.mimeType.startsWith("video/")), [assets]);
  const files = useMemo(
    () => assets.filter((v) => !v.mimeType.startsWith("image/") && !v.mimeType.startsWith("video/")),
    [assets],
  );

  async function uploadViaFallbackApi(file: File, originalName?: string): Promise<void> {
    const form = new FormData();
    form.set("file", file, originalName || file.name);
    const res = await fetch(`/api/spaces/${slug}/assets`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(`${originalName || file.name} 上传失败`);
    }
  }

  async function uploadOneFile(file: File, originalName?: string): Promise<void> {
    try {
      await upload(originalName || file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify({
          slug,
          originalName: originalName || file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
    } catch {
      await uploadViaFallbackApi(file, originalName);
    }
  }

  async function refreshAfterBlobSync(): Promise<void> {
    router.refresh();
    await new Promise((resolve) => setTimeout(resolve, 900));
    router.refresh();
  }

  async function unlockSpace(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        throw new Error("密码校验失败");
      }
      setPassword("");
      setShowEditAuth(false);
      notify(canRead ? "编辑权限已开启" : "验证成功，正在进入空间", "success");
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "验证失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${slug}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        throw new Error("保存失败，请确认密码权限");
      }
      notify("文本已保存", "success");
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }
    setBusy(true);
    try {
      for (const file of Array.from(fileList)) {
        await uploadOneFile(file);
      }
      notify("上传完成，正在同步列表", "success");
      await refreshAfterBlobSync();
    } catch (error) {
      notify(error instanceof Error ? error.message : "上传失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!canWrite) {
      return;
    }
    const item = Array.from(e.clipboardData.items).find((v) => v.type.startsWith("image/"));
    if (!item) {
      return;
    }

    const file = item.getAsFile();
    if (!file) {
      return;
    }
    e.preventDefault();

    setBusy(true);
    try {
      const pastedName = `pasted-${Date.now()}.png`;
      await uploadOneFile(file, pastedName);
      notify("图片已上传，正在同步列表", "success");
      await refreshAfterBlobSync();
    } catch (error) {
      notify(error instanceof Error ? error.message : "图片保存失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(assetId: string) {
    if (!confirm("确认删除该资源吗？")) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${slug}/assets/${assetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("删除失败");
      }
      notify("资源已删除", "success");
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      {toast && <TopToast message={toast.message} onClose={() => setToast(null)} tone={toast.tone} />}

      <header className="panel p-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 font-mono text-xs text-[var(--ink-1)]">/{slug}</p>
        {isPublicSpace ? (
          <p className="mt-2 text-sm text-[var(--ink-1)]">
            公共空间默认可直接阅读与复制，点击编辑并完成空间密码验证后，可修改文本并上传图片/视频/文件。
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-1)]">
            该空间为独立密码空间，验证后可阅读、复制、下载并编辑内容。
          </p>
        )}
      </header>

      {!canRead && requiresEntryPassword && (
        hasPassword ? (
          <form className="panel flex flex-col gap-3 p-4 sm:flex-row" onSubmit={unlockSpace}>
            <input
              className="field"
              type="password"
              placeholder="输入空间密码后进入"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy} type="submit">
              进入空间
            </button>
          </form>
        ) : (
          <div className="panel p-4 text-sm text-[var(--ink-1)]">该空间尚未设置访问密码，请联系管理员设置后再访问。</div>
        )
      )}

      {!canRead ? null : (
        <>
          {!canWrite && (
            <div className="panel p-4">
              {hasPassword ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowEditAuth((v) => !v)}
                      type="button"
                    >
                      编辑
                    </button>
                    <p className="text-sm text-[var(--ink-1)]">编辑前需验证该空间密码。</p>
                  </div>
                  {showEditAuth && (
                    <form className="mt-3 flex flex-col gap-3 sm:flex-row" onSubmit={unlockSpace}>
                      <input
                        className="field"
                        type="password"
                        placeholder="输入空间密码开启编辑"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button className="btn btn-primary" disabled={busy} type="submit">
                        验证并编辑
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--ink-1)]">该空间尚未设置编辑密码，当前仅支持阅读与复制。</p>
              )}
            </div>
          )}

          <article className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">文本区</h2>
              <button
                className="btn btn-ghost"
                onClick={() => navigator.clipboard.writeText(text)}
                type="button"
              >
                复制全部文本
              </button>
            </div>
            <textarea
              className="field min-h-60 font-mono"
              maxLength={50000}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              readOnly={!canWrite}
              value={text}
            />
            {canWrite && (
              <div className="mt-3 flex items-center gap-2">
                <button className="btn btn-primary" disabled={busy} onClick={saveNote} type="button">
                  保存文本
                </button>
                <label className="btn btn-ghost">
                  上传文件/图片/视频
                  <input
                    className="hidden"
                    onChange={(e) => uploadFiles(e.target.files)}
                    type="file"
                    multiple
                  />
                </label>
              </div>
            )}
            <p className="mt-2 text-xs text-[var(--ink-1)]">支持直接粘贴图片，会自动转为文件并展示预览。</p>
          </article>

          <article className="panel p-4">
            <h2 className="text-lg font-semibold">图片区</h2>
            {images.length === 0 && <p className="mt-2 text-sm text-[var(--ink-1)]">暂无图片</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((asset) => (
                <div className="rounded-xl border border-[var(--line)] bg-white p-2" key={asset.id}>
                  <Image
                    alt={asset.name}
                    className="h-44 w-full rounded-lg object-cover"
                    src={`/api/spaces/${slug}/assets/${asset.id}`}
                    width={320}
                    height={176}
                    unoptimized
                  />
                  <p className="mt-2 truncate text-xs">{asset.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <a
                      className="btn btn-ghost"
                      href={`/api/spaces/${slug}/assets/${asset.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开
                    </a>
                    {canWrite && (
                      <button
                        className="btn btn-danger"
                        onClick={() => removeAsset(asset.id)}
                        type="button"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel p-4">
            <h2 className="text-lg font-semibold">视频区</h2>
            {videos.length === 0 && <p className="mt-2 text-sm text-[var(--ink-1)]">暂无视频</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {videos.map((asset) => (
                <div className="rounded-xl border border-[var(--line)] bg-white p-2" key={asset.id}>
                  <video
                    className="h-48 w-full rounded-lg bg-black object-contain"
                    controls
                    preload="metadata"
                    src={`/api/spaces/${slug}/assets/${asset.id}`}
                  />
                  <p className="mt-2 truncate text-xs">{asset.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <a
                      className="btn btn-ghost"
                      href={`/api/spaces/${slug}/assets/${asset.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      下载
                    </a>
                    {canWrite && (
                      <button
                        className="btn btn-danger"
                        onClick={() => removeAsset(asset.id)}
                        type="button"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel p-4">
            <h2 className="text-lg font-semibold">文件区</h2>
            {files.length === 0 && <p className="mt-2 text-sm text-[var(--ink-1)]">暂无文件</p>}
            <div className="mt-2 space-y-2">
              {files.map((asset) => (
                <div
                  className="flex flex-col justify-between gap-2 rounded-lg border border-[var(--line)] bg-white p-3 sm:flex-row sm:items-center"
                  key={asset.id}
                >
                  <div>
                    <p className="text-sm font-medium">{asset.name}</p>
                    <p className="text-xs text-[var(--ink-1)]">
                      {fmtSize(asset.size)} · {new Date(asset.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      className="btn btn-ghost"
                      href={`/api/spaces/${slug}/assets/${asset.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      下载
                    </a>
                    {canWrite && (
                      <button
                        className="btn btn-danger"
                        onClick={() => removeAsset(asset.id)}
                        type="button"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </>
      )}
    </section>
  );
}
