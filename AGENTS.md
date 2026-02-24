# AGENTS.md

## 1) Project Identity

- Name: `quick-space`
- Type: Next.js web app (App Router, TypeScript)
- Goal: Multi-space temporary notebook for cross-device sharing without account login.
- Current product headline: `免登录临时笔记本`

## 2) Core Product Rules (Latest)

- Home (`/`) shows all space titles and paths.
- Admin entry is hidden from front pages (admin route still exists at `/admin`).
- Access model:
  - Public space (`DEFAULT_SPACE_SLUG`) can be opened directly for read/copy/download.
  - Public space editing requires password verification (click `编辑` then verify).
  - Non-public spaces require space password before content is visible.
- All content inside accessible spaces can be read/copied/downloaded.
- Upload max size: `10MB` per file.
- Supported content blocks in space detail:
  - Text
  - Images
  - Videos (preview + download)
  - Files

## 3) Stack and Runtime

- Next.js 16 + React 19
- Bun package manager
- Prisma ORM + PostgreSQL
- `bcryptjs` for password hash
- `zod` for API payload validation

## 4) Architecture Overview

- Server pages:
  - `src/app/page.tsx` => home list
  - `src/app/[slug]/page.tsx` => space detail
  - `src/app/admin/page.tsx` => admin console
- Client components:
  - `src/components/space-view.tsx`
  - `src/components/admin-panel.tsx`
- APIs:
  - Admin:
    - `POST /api/admin/unlock`
    - `POST /api/admin/logout`
    - `POST|PATCH|DELETE /api/admin/spaces`
  - Space:
    - `POST /api/spaces/[slug]/unlock`
    - `POST /api/spaces/[slug]/lock`
    - `PUT /api/spaces/[slug]/note`
    - `POST /api/spaces/[slug]/assets`
    - `GET|DELETE /api/spaces/[slug]/assets/[assetId]`

## 5) Permission Model

- Admin session => full read/write for all spaces.
- Space session cookie (`qs_space_<slug>`) => read/write for that private space.
- Public space read is always allowed.
- Public/private write always requires either admin session or valid space password session.
- Private asset GET is protected by read permission; public asset GET remains open through public-space read policy.

## 6) Data Model

- `Space`: `title`, `slug`, `passwordHash`, timestamps
- `Note`: one-to-one space plain text content
- `Asset`: binary data + `mimeType`, `name`, `size`
- `AuditLog`: action, actor, ip, detail, timestamps

Schema file: `prisma/schema.prisma`

## 7) Environment Variables

Required:

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `DEFAULT_SPACE_SLUG`
- `DEFAULT_SPACE_TITLE`

Vercel fallback support is implemented for injected Postgres variables:

- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_POSTGRES_URL`
- `POSTGRES_PRISMA_PRISMA_DATABASE_URL`

## 8) Local Dev Runbook

1. `bun install`
2. `bun run prisma:generate`
3. `bun run prisma:push`
4. `bun run dev`

Checks:

- `bun run lint`
- `bunx tsc --noEmit`

## 9) Deployment Notes

- Build script runs Prisma generate + db push before Next build.
- On Vercel, ensure actual values exist (not empty placeholders) for env vars.
- If runtime shows app error page, check Function Runtime Logs first.

## 10) Coding Conventions

- Keep permission checks centralized in `src/lib/space-permission.ts`.
- Validate API input with `zod`.
- Persist security-sensitive operations to `AuditLog`.
- Do not expose or commit secrets/tokens.
