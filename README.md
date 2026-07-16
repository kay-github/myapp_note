# Quick Space

跨设备临时传输工具（偏公开）。

- 首页展示全部空间（笔记本）
- 空间内容默认可读可复制
- 文本写入、文件上传、粘贴图片需空间密码
- 超管密码可创建/修改/删除空间，并免密进入任意空间

## 技术栈

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- Vercel Blob 直传（大文件）+ PostgreSQL 元数据

## 本地启动

1) 复制环境变量

```bash
cp .env.example .env
```

2) 修改 `.env` 的 `DATABASE_URL`

建议同时设置 `DATA_ENCRYPTION_KEY`（用于内容加密存储）

3) 生成客户端并建表

```bash
bun run prisma:generate
bun run prisma:push
```

4) 启动

```bash
bun run dev
```

打开 `http://localhost:3000`。

## 默认规则

- 文件大小上限：50MB（Vercel Blob 直传）
- 路径规则：`[a-zA-Z0-9_-]`，长度 `3~30`
- 默认公共空间首次访问时自动创建

## 性能说明

- 空间页只查询附件元数据（不读文件二进制），页面加载更快
- 审计日志在响应返回后异步落库（`next/server` 的 `after`），不阻塞解锁/保存/上传
- 保存/清空文本不再整页刷新；解锁与删除通过 `useTransition` 刷新，按钮保持加载态直到新内容渲染
- 多文件上传并行执行；上传完成后单次刷新同步列表
- 首页附件数用 `_count` 聚合统计；默认公共空间仅在缺失时补建

## Vercel 免费版说明

- 推荐使用免费的外部 PostgreSQL（如 Supabase/Neon）
- 生产建议启用 Vercel Blob（需要 `BLOB_READ_WRITE_TOKEN`）
- 构建脚本会自动执行 `prisma db push`，确保生产库表结构存在
- 若线上出现 `Application error`，先检查 Vercel 环境变量是否已配置：`DATABASE_URL`、`ADMIN_PASSWORD`、`SESSION_SECRET`
- 文本与数据库落地的附件采用应用层加密存储，需保持 `DATA_ENCRYPTION_KEY` 稳定且安全
