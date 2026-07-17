"use client";

import { ClipboardEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { TopToast, ToastTone } from "@/components/top-toast";
import { SpaceQr } from "@/components/space-qr";
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
  noteUpdatedAt: string | null;
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
  noteUpdatedAt,
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
  const [isRefreshing, startRefresh] = useTransition();
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  // 上传会话号：部分文件失败后，仍在后台继续的上传不得再更新进度条
  const uploadSessionRef = useRef(0);
  // 保存冲突检测的基准版本：客户端最后一次看到的服务端 updatedAt
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(noteUpdatedAt);
  const pending = busy || isRefreshing;

  // 事件回调与轮询里需要读取最新值，用 ref 镜像
  const textRef = useRef(text);
  textRef.current = text;
  const busyRef = useRef(pending);
  busyRef.current = pending;
  // 已同步到本地的服务端文本，用于判断本地是否有未保存修改（dirty）
  const lastSyncedNoteRef = useRef(note);
  const prevSlugRef = useRef(slug);
  const remoteStateRef = useRef({
    noteUpdatedAt,
    assetCount: assets.length,
    latestAssetAt: assets[0]?.createdAt ?? null,
  });

  useEffect(() => {
    remoteStateRef.current = {
      noteUpdatedAt,
      assetCount: assets.length,
      latestAssetAt: assets[0]?.createdAt ?? null,
    };
  }, [noteUpdatedAt, assets]);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    const slugChanged = prevSlugRef.current !== slug;
    prevSlugRef.current = slug;
    const dirty = !slugChanged && textRef.current !== lastSyncedNoteRef.current;
    if (!dirty) {
      // 本地没有未保存修改，安全地同步服务端最新文本
      setText(note);
      lastSyncedNoteRef.current = note;
      setBaseUpdatedAt(noteUpdatedAt);
    } else if (note !== lastSyncedNoteRef.current) {
      // 本地有未保存修改且远端已变化：保留本地文本，保存时走冲突确认
      notify("其他设备更新了文本，本地未保存的修改已保留，保存时将提示确认", "info");
    }
  }, [note, noteUpdatedAt, slug, notify]);

  // 跨设备同步：定时 + 页面重新聚焦时查询轻量状态接口，内容有变化才整页刷新
  const checkRemoteUpdates = useCallback(async () => {
    if (busyRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/spaces/${slug}/state`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        noteUpdatedAt: string | null;
        assetCount: number;
        latestAssetAt: string | null;
      };
      const current = remoteStateRef.current;
      if (
        data.noteUpdatedAt !== current.noteUpdatedAt ||
        data.assetCount !== current.assetCount ||
        data.latestAssetAt !== current.latestAssetAt
      ) {
        startRefresh(() => {
          router.refresh();
        });
      }
    } catch {
      // 网络抖动忽略，等待下一轮
    }
  }, [slug, router, startRefresh]);

  useEffect(() => {
    if (!canRead) return;
    const timer = setInterval(() => {
      void checkRemoteUpdates();
    }, 25 * 1000);
    const onFocus = () => {
      void checkRemoteUpdates();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void checkRemoteUpdates();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canRead, checkRemoteUpdates]);

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

  async function registerBlobAsset(
    blobUrl: string,
    originalName: string,
    mimeType: string,
    size: number,
  ): Promise<void> {
    const res = await fetch(`/api/spaces/${slug}/assets/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blobUrl,
        originalName,
        mimeType,
        size,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `${originalName} 上传登记失败`);
    }
  }

  async function uploadOneFile(
    file: File,
    originalName?: string,
    onProgress?: (loaded: number) => void,
  ): Promise<void> {
    const name = originalName || file.name;
    let blobUploaded = false;
    try {
      const blob = await upload(name, file, {
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify({
          slug,
          originalName: name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        }),
        onUploadProgress: (event) => {
          onProgress?.(Math.min(event.loaded, file.size));
        },
      });
      blobUploaded = true;

      if (!blob || typeof blob.url !== "string" || blob.url.length === 0) {
        await uploadViaFallbackApi(file, originalName);
        onProgress?.(file.size);
        return;
      }

      await registerBlobAsset(
        blob.url,
        name,
        file.type || blob.contentType || "application/octet-stream",
        file.size,
      );
      onProgress?.(file.size);
    } catch (error) {
      if (blobUploaded) {
        console.error("[uploadOneFile:register-failed]", error);
        throw error;
      }
      console.warn("[uploadOneFile:blob-fallback]", error);
      // 兜底接口没有进度事件，完成时一次性计满
      await uploadViaFallbackApi(file, originalName);
      onProgress?.(file.size);
    }
  }

  async function refreshAfterBlobSync(): Promise<void> {
    // 附件登记接口返回时数据已写入数据库，单次刷新即可拿到最新列表
    startRefresh(() => {
      router.refresh();
    });
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
      // transition 会让按钮保持加载态，直到服务端渲染出解锁后的内容
      startRefresh(() => {
        router.refresh();
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "验证失败", "error");
    } finally {
      setBusy(false);
    }
  }

  function putNote(content: string, force: boolean): Promise<Response> {
    return fetch(`/api/spaces/${slug}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, baseUpdatedAt, force }),
    });
  }

  // 保存成功后同步冲突基准与轮询基准，避免下次保存误报冲突、轮询把自己的保存当成远端更新
  async function applySaved(res: Response, content: string): Promise<void> {
    const data = (await res.json().catch(() => null)) as { updatedAt?: string } | null;
    lastSyncedNoteRef.current = content;
    if (data?.updatedAt) {
      setBaseUpdatedAt(data.updatedAt);
      remoteStateRef.current = { ...remoteStateRef.current, noteUpdatedAt: data.updatedAt };
    }
  }

  async function saveNote() {
    const content = text;
    setBusy(true);
    try {
      let res = await putNote(content, false);
      if (res.status === 409) {
        if (!confirm("其他设备已修改过该文本，确定用当前内容覆盖吗？\n（取消保存后可刷新页面查看最新内容）")) {
          notify("已取消保存", "info");
          return;
        }
        res = await putNote(content, true);
      }
      if (!res.ok) {
        throw new Error("保存失败，请确认密码权限");
      }
      await applySaved(res, content);
      notify("文本已保存", "success");
      // 文本已在本地 state，无需整页刷新
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearNote() {
    if (!confirm("确认清空当前文本内容吗？")) {
      return;
    }

    const previous = text;
    setText("");
    setBusy(true);
    try {
      // 清空已经人工确认过，直接覆盖远端
      const res = await putNote("", true);
      if (!res.ok) {
        throw new Error("清空失败，请重试");
      }
      await applySaved(res, "");
      notify("文本已清空", "success");
    } catch (error) {
      setText(previous);
      notify(error instanceof Error ? error.message : "清空失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }
    const files = Array.from(fileList);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0) || 1;
    const loadedByFile = files.map(() => 0);
    const session = ++uploadSessionRef.current;
    setBusy(true);
    setUploadPct(0);
    try {
      // 并行上传多个文件，缩短整体等待时间；进度按总字节数聚合
      await Promise.all(
        files.map((file, index) =>
          uploadOneFile(file, undefined, (loaded) => {
            if (uploadSessionRef.current !== session) return;
            loadedByFile[index] = Math.min(loaded, file.size);
            const loadedSum = loadedByFile.reduce((a, b) => a + b, 0);
            setUploadPct(Math.min(99, Math.round((loadedSum / totalBytes) * 100)));
          }),
        ),
      );
      setUploadPct(100);
      notify("上传完成，正在同步列表", "success");
      await refreshAfterBlobSync();
    } catch (error) {
      notify(error instanceof Error ? error.message : "上传失败", "error");
    } finally {
      uploadSessionRef.current += 1;
      setBusy(false);
      setUploadPct(null);
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

    const session = ++uploadSessionRef.current;
    setBusy(true);
    setUploadPct(0);
    try {
      const pastedName = `pasted-${Date.now()}.png`;
      await uploadOneFile(file, pastedName, (loaded) => {
        if (uploadSessionRef.current !== session) return;
        setUploadPct(Math.min(99, Math.round((loaded / (file.size || 1)) * 100)));
      });
      setUploadPct(100);
      notify("图片已上传，正在同步列表", "success");
      await refreshAfterBlobSync();
    } catch (error) {
      notify(error instanceof Error ? error.message : "图片保存失败", "error");
    } finally {
      uploadSessionRef.current += 1;
      setBusy(false);
      setUploadPct(null);
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
      startRefresh(() => {
        router.refresh();
      });
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 font-mono text-xs text-[var(--ink-1)]">/{slug}</p>
          </div>
          <SpaceQr />
        </div>
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
            <button className="btn btn-primary" disabled={pending} type="submit">
              {pending ? "正在进入…" : "进入空间"}
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
                      <button className="btn btn-primary" disabled={pending} type="submit">
                        {pending ? "验证中…" : "验证并编辑"}
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
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    notify("复制成功", "success");
                  } catch {
                    notify("复制失败，请手动复制", "error");
                  }
                }}
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
                <button className="btn btn-danger" disabled={busy} onClick={clearNote} type="button">
                  清空文本
                </button>
              </div>
            )}
            {uploadPct !== null && (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--brand-soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-200"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--ink-1)]">上传中 {uploadPct}%</p>
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
