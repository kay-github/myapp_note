# AGENTS.md

## 1) Project Identity

- Name: `quick-space`
- Type: Next.js web app (App Router, TypeScript)
- Goal: Fast cross-device transfer workspace with password-gated write access.
- Primary UX:
  - List all spaces on home page.
  - Read/copy content without login.
  - Write/upload/paste-image after space password verification.
  - Admin password unlocks full management.

## 2) Product Rules (Current)

- All spaces are visible on `/`.
- Space write permission:
  - Admin session => can write all spaces.
  - Space session (unlocked by space password) => can write that space.
  - No session => read-only.
- File upload max size: `10MB`.
- Slug rule: `^[a-zA-Z0-9_-]{3,30}$` and globally unique.
- Public direct asset access is enabled via API URL.

## 3) Stack and Runtime

- Framework: Next.js 16 + React 19
- Package manager: Bun
- ORM: Prisma
- Database: PostgreSQL
- Password hashing: `bcryptjs`
- Validation: `zod`

## 4) High-Level Architecture

- Server pages:
  - `src/app/page.tsx` => space list
  - `src/app/[slug]/page.tsx` => space detail/editor
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

## 5) Data Model (Prisma)

- `Space`: title, slug, optional passwordHash, timestamps
- `Note`: one-to-one with space, plain content
- `Asset`: file metadata + binary bytes
- `AuditLog`: action history with actor/ip/detail

Schema file: `prisma/schema.prisma`

## 6) Security and Session Notes

- Admin and space sessions are cookie-based and HMAC-signed.
- Utility: `src/lib/auth.ts`
- Password verification:
  - Admin password from env (`ADMIN_PASSWORD`)
  - Space password hash stored in DB
- Lightweight in-memory rate limit exists (`src/lib/ratelimit.ts`).
  - For multi-instance production, replace with Redis/Upstash.

## 7) Environment Variables

Required (see `.env.example`):

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `DEFAULT_SPACE_SLUG`
- `DEFAULT_SPACE_TITLE`

## 8) Local Development Runbook

1. Install deps: `bun install`
2. Generate Prisma client: `bun run prisma:generate`
3. Push schema: `bun run prisma:push`
4. Start dev server: `bun run dev`

Quality checks:

- Lint: `bun run lint`
- Type check: `bunx tsc --noEmit`

## 9) Deploy Notes (Vercel)

- Works on Vercel with external Postgres.
- Current asset storage is DB binary (MVP-friendly, not long-term ideal).
- If traffic/files grow, migrate assets to object storage (Supabase Storage or Vercel Blob).

## 10) Coding and Change Conventions

- Keep write-access checks centralized via `canWriteSpace`.
- Validate all API payloads with `zod`.
- Log sensitive actions using `writeAudit`.
- Do not commit `.env` or secrets.
- Preserve slug uniqueness and rule validation when editing admin APIs.

## 11) Known Limitations / Next Upgrades

- In-memory rate limit resets on restart and is not distributed.
- Asset bytes in DB increase DB size quickly.
- No user account system (by design).
- No background cleanup (content is permanent until manual delete).
