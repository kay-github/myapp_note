# Quick Space

跨设备临时传输工具（偏公开）。

- 首页展示全部空间（笔记本）
- 空间内容默认可读可复制
- 文本写入、文件上传、粘贴图片需空间密码
- 超管密码可创建/修改/删除空间，并免密进入任意空间

## 技术栈

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- 文件二进制存储在数据库（MVP）

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

- 文件大小上限：50MB
- 路径规则：`[a-zA-Z0-9_-]`，长度 `3~30`
- 默认公共空间首次访问时自动创建

## Vercel 免费版说明

- 推荐使用免费的外部 PostgreSQL（如 Supabase/Neon）
- 当前文件存数据库，后续若附件量变大建议切换对象存储（Supabase Storage / Vercel Blob）
- 构建脚本会自动执行 `prisma db push`，确保生产库表结构存在
- 若线上出现 `Application error`，先检查 Vercel 环境变量是否已配置：`DATABASE_URL`、`ADMIN_PASSWORD`、`SESSION_SECRET`
- 私有空间文本与附件在数据库中以应用层加密存储，需保持 `DATA_ENCRYPTION_KEY` 稳定且安全
