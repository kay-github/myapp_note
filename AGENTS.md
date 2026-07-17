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
- Upload max size: `50MB` per file.
- File upload path prefers Vercel Blob direct upload to avoid serverless request-body limits.
- Supported content blocks in space detail:
  - Text
  - Images
  - Videos (preview + download)
  - Files
- User feedback uses top-center auto-dismiss toast notifications for save/upload/auth/update outcomes.

## 2.1) Performance Conventions

- Space page queries asset metadata only (`select` without `data`); never load encrypted binary payloads in list views.
- Home page counts assets via `_count` aggregation instead of fetching rows.
- `ensureDefaultSpace` is called lazily — only when the default space is actually missing, not on every request.
- `writeAudit` runs after the response via `next/server` `after()`; audit writes must never block user-facing latency.
- Client: note save/clear keep local state without full `router.refresh()`; unlock/delete refresh inside `useTransition` so buttons stay in loading state until fresh server content renders; multi-file uploads run in parallel.
- Buttons use `white-space: nowrap` (`.btn` in `globals.css`) to avoid CJK label line-breaks in flex rows.
- Blob asset downloads: after permission check, `GET /api/spaces/[slug]/assets/[assetId]` issues a short-lived signed CDN URL (`src/lib/blob-sign.ts`, 10-min TTL, in-process token cache) and 302-redirects — bytes never proxy through the serverless function. Falls back to the legacy authenticated proxy when presigning fails. Requires `@vercel/blob` >= 2.4 signed-URL APIs (`issueSignedToken`/`presignUrl`).
- Cross-device sync: `GET /api/spaces/[slug]/state` is a lightweight version endpoint (note updatedAt + asset count + latest asset time). The client polls it every 25s and on window focus/visibility, and only calls `router.refresh()` when something changed.
- Note conflict safety: `PUT /note` accepts `baseUpdatedAt` + `force`; mismatched base returns 409 and the client asks before overwriting. Local unsaved edits are never clobbered by a refresh (dirty check in `space-view.tsx` sync effect).
- Uploads report aggregate progress via `onUploadProgress`; a session counter (`uploadSessionRef`) prevents stale progress updates after a failed batch.
- `loading.tsx` skeletons exist for `/` and `/[slug]`.
- QR code (`src/components/space-qr.tsx`) uses zero-dependency `qrcode-generator`, dynamically imported on first open.

## 2.2) Security Conventions

- Space session cookies embed a fingerprint of the current `passwordHash` — changing a space password invalidates all existing sessions for it (see `setSpaceSession`/`canWriteWithSpaceCookie` in `src/lib/auth.ts`).
- `ADMIN_PASSWORD` and `SESSION_SECRET` are required in production: `src/lib/config.ts` throws at build/boot when missing (dev keeps local fallbacks). Never reintroduce hardcoded production secrets.
- Admin space deletion deletes all Vercel Blob files first (`del(blobUrls)`), then the DB rows; the audit entry for a deleted space must not reference `spaceId` (FK would fail).

## 3) Stack and Runtime

- Next.js 16 + React 19
- Bun package manager
- Prisma ORM + PostgreSQL
- Vercel Blob for large asset objects
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
- `Note`: one-to-one space text content (stored encrypted at application layer)
- `Asset`: metadata + storage marker (`blob` or `db`) and optional `blobUrl`; DB payload remains encrypted when used.
- `AuditLog`: action, actor, ip, detail, timestamps

Schema file: `prisma/schema.prisma`

## 7) Environment Variables

Required:

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `DATA_ENCRYPTION_KEY`
- `BLOB_READ_WRITE_TOKEN` (required for Vercel Blob direct upload in production)
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
- Keep note/asset storage encrypted using helpers in `src/lib/crypto.ts`.
- Keep DB-fallback asset storage encrypted using helpers in `src/lib/crypto.ts`.
- Do not expose or commit secrets/tokens.
