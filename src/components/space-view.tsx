"use client";

import { ClipboardEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
  canWrite: boolean;
  hasPassword: boolean;
  isAdmin: boolean;
  assets: AssetItem[];
};

function fmtSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function SpaceView({ slug, title, note, canWrite, hasPassword, isAdmin, assets }: Props) {
  const router = useRouter();
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const images = useMemo(() => assets.filter((v) => v.mimeType.startsWith("image/")), [assets]);
  const files = useMemo(() => assets.filter((v) => !v.mimeType.startsWith("image/")), [assets]);

  async function unlockSpace(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/spaces/${slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        throw new Error("密码校验失败");
      }
      setStatus("密码验证成功");
      setPassword("");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "验证失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/spaces/${slug}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        throw new Error("保存失败，请确认密码权限");
      }
      setStatus("文本已保存");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      for (const file of Array.from(fileList)) {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch(`/api/spaces/${slug}/assets`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          throw new Error(`${file.name} 上传失败`);
        }
      }
      setStatus("文件上传完成");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "上传失败");
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

    const form = new FormData();
    form.set("file", file, `pasted-${Date.now()}.png`);

    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/spaces/${slug}/assets`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error("粘贴图片上传失败");
      }
      setStatus("图片已粘贴并保存");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "图片保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(assetId: string) {
    if (!confirm("确认删除该文件吗？")) {
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/spaces/${slug}/assets/${assetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("删除失败");
      }
      setStatus("文件已删除");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="panel p-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 font-mono text-xs text-[var(--ink-1)]">/{slug}</p>
        <p className="mt-2 text-sm text-[var(--ink-1)]">
          当前状态：{canWrite ? "可写" : "只读"}
          {isAdmin ? "（超管）" : ""}
        </p>
      </header>

      {!canWrite && hasPassword && (
        <form className="panel flex flex-col gap-3 p-4 sm:flex-row" onSubmit={unlockSpace}>
          <input
            className="field"
            type="password"
            placeholder="输入空间密码以开启写入"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy} type="submit">
            验证密码
          </button>
        </form>
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
              上传文件/图片
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
                <a className="btn btn-ghost" href={`/api/spaces/${slug}/assets/${asset.id}`} target="_blank">
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
                <a className="btn btn-ghost" href={`/api/spaces/${slug}/assets/${asset.id}`} target="_blank">
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

      {status && <p className="text-sm text-[var(--ink-1)]">{status}</p>}
    </section>
  );
}
