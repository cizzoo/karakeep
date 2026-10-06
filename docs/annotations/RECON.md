# Page Annotations — Repository Recon

Verified facts the page-annotations feature relies on. Written during Phase 0 before
any feature code, so later phases can skip re-deriving the repo's conventions.

## Monorepo layout

- **DB schema**: `packages/db/schema.ts` (single file, all tables). Migrations in
  `packages/db/drizzle/*.sql`, numbered sequentially, generated with
  `pnpm db:generate --name <description>` (wraps `drizzle-kit generate`, config at
  `packages/db/drizzle.config.ts`). Snapshots/journal live in
  `packages/db/drizzle/meta/`. `packages/db/index.ts` re-exports `* as schema` from
  `./schema`, and `packages/db/drizzle.ts` wires `drizzle(sqlite, { schema })`, so any
  new table exported from `schema.ts` is automatically available as
  `db.query.<table>` with no extra registration.
- **tRPC routers**: `packages/trpc/routers/*.ts`, root router assembled in
  `packages/trpc/routers/_app.ts`. Business logic lives one level down in
  `packages/trpc/models/*.service.ts` (authorization + orchestration) and
  `*.repo.ts` (raw Drizzle queries) — routers stay thin.
- **Shared zod types**: `packages/shared/types/*.ts`. No barrel/index file — every
  module is deep-imported directly (e.g. `@karakeep/shared/types/highlights`).
- **Web app (Next.js App Router)**: `apps/web/app/...` for routes,
  `apps/web/components/...` for components, `apps/web/lib/...` for client-side pure
  logic and hooks glue.
- **REST API v1**: Hono app in `packages/api/`, routes in `packages/api/routes/*.ts`,
  mounted in `packages/api/index.ts`. Not built for this feature (optional/deferred).
- **i18n**: `apps/web/lib/i18n/locales/en/translation.json`, consumed via
  `useTranslation()` from `apps/web/lib/i18n/client.ts` (client components) or
  `apps/web/lib/i18n/server.ts` (server components).

## Highlights feature (the template)

- Table: `packages/db/schema.ts` (`highlights`) — `createId()` from
  `@paralleldrive/cuid2` for ids, `createdAtField()` helper for timestamps, FKs with
  `onDelete: cascade` to `bookmarks`/`users`, plain `index()` entries on both FK
  columns. No `relations()` block — the codebase does fine without one for
  single-parent tables like this.
- Router: `packages/trpc/routers/highlights.ts`, service/repo split in
  `packages/trpc/models/highlights.service.ts` / `highlights.repo.ts`. Ownership is
  enforced via `assertOwnership`/`authorize`/`Authorized<T>` in
  `packages/trpc/lib/actor.ts` — `FORBIDDEN` by default, `NOT_FOUND` only when a
  caller is told a resource doesn't exist. Parent-bookmark access is enforced by
  `ensureBookmarkOwnership`/`ensureBookmarkAccess` middlewares exported from
  `packages/trpc/routers/bookmarks.ts`.
- Zod types: `packages/shared/types/highlights.ts`.
- Web hooks: one hook per mutation in `packages/shared-react/hooks/highlights.ts`,
  `useTRPC()` + `useMutation(...mutationOptions)` + invalidate-on-success (no
  optimistic updates anywhere in this feature).
- Tests: `packages/trpc/routers/highlights.test.ts` using the harness in
  `packages/trpc/testUtils.ts` (`defaultBeforeEach`, `CustomTestContext`,
  `apiCallers`).

## Assets and archives

- Asset type enum: `AssetTypes` in `packages/db/schema.ts`. Monolith archive =
  `LINK_FULL_PAGE_ARCHIVE` ("linkFullPageArchive"); SingleFile upload archive =
  `LINK_PRECRAWLED_ARCHIVE` ("linkPrecrawledArchive"). User-facing bookmark fields:
  `fullPageArchiveAssetId` / `precrawledArchiveAssetId` on `ZBookmarkedLink`.
- Streaming reads: `@karakeep/shared-server` exports `createAssetReadStream`,
  `readAssetMetadata`, `getAssetSize` (wraps `packages/shared/assetdb.ts`'s
  `AssetStore` interface — supports byte ranges). `apps/web` already depends on
  `@karakeep/shared-server`.
- Existing archive viewer: `FullPageArchiveSection` in
  `apps/web/components/dashboard/preview/LinkContentSection.tsx` —
  `<iframe sandbox="" src={getAssetUrl(archiveAssetId)} />`.
- Existing asset route: `packages/api/routes/assets.ts` (`GET /:assetId`), headers
  set in `packages/api/utils/assets.ts` (`serveAsset()`). **Not reusable** for the
  annotation viewer: its CSP includes a bare `sandbox` token, which forces an opaque
  origin on the framed document and would make `iframe.contentDocument`
  inaccessible from the parent — breaking highlight rendering entirely. A new
  dedicated route is required (see below).
- Precedent for a literal Next.js route coexisting with the app-wide catch-all:
  `apps/web/app/api/bookmarks/export/route.tsx` lives alongside
  `apps/web/app/api/[[...route]]/route.ts` and works (literal path segments win over
  catch-all segments in Next.js routing). It uses `createContextFromRequest` from
  `apps/web/server/api/client.ts` for auth — the pattern the new archive route
  copies.

## Auth

- Server components / Server Actions: `getServerAuthSession()`,
  `apps/web/server/auth.ts`, imported as `import { getServerAuthSession } from "@/server/auth"`.
- Next.js Route Handlers: `createContextFromRequest(request)` from
  `apps/web/server/api/client.ts` — handles both cookie session and API-key bearer
  auth, returns a `ctx.user`.
- tRPC API-key scopes: `createScopedAuthedProcedure(resource)`
  (`packages/trpc/index.ts`) requires `resource` to be a member of
  `API_KEY_SCOPE_RESOURCES` (`packages/shared/types/apiKeys.ts`), which in turn (via
  a `satisfies Record<...>` map) forces a matching entry in
  `apps/web/components/settings/apiKeyScopes.ts` and two i18n keys. This applies to
  every authed tRPC procedure, independent of whether a REST surface exists.

## Entry points

- Bookmark card/list "…" menu: `apps/web/components/dashboard/bookmarks/BookmarkOptions.tsx`
  — `actionItems: ActionItemType[]` array, each item `{id, title, icon, visible,
  disabled, onClick}`, filtered by `visible` and rendered as shadcn
  `DropdownMenuItem`s.
- Bookmark detail/preview header: `apps/web/components/dashboard/preview/ActionBar.tsx`
  — flex row of `Tooltip` + `Button`/`ActionButton`.
- Full-page, sidebar-free, bookmark-scoped routes use a **top-level sibling route**
  with its own `layout.tsx` (not a route nested under `app/dashboard/`, which is
  always wrapped in `SidebarLayout` with no per-route opt-out). Precedent:
  `apps/web/app/reader/layout.tsx` + `apps/web/app/reader/[bookmarkId]/page.tsx`.

## Tooling

- `pnpm typecheck` / `pnpm lint` / `pnpm lint:fix` / `pnpm format` / `pnpm format:fix`
  / `pnpm test` (all via turbo); scoped: `pnpm --filter @karakeep/trpc test`.
- Migration generation: `pnpm db:generate --name <description>` →
  `drizzle-kit generate`.
- Test framework: Vitest. Harness: `packages/trpc/testUtils.ts`.
- Safe comment rendering: `apps/web/components/ui/markdown/markdown-readonly.tsx`.
- Generic confirmation dialog: `apps/web/components/ui/action-confirming-dialog.tsx`.

## Pre-existing issue found during Phase 1 (unrelated to this feature)

`packages/db/drizzle/meta/_journal.json`'s snapshot chain is missing several tables
and columns that already have real, applied migrations on disk — specifically
`chatMessages`/`chatSessions` (added by `0088_add_chat_tables.sql`) and `bookmarks`'s
`lastSavedAt`/`embeddingStatus` columns (added by `0092_add_last_saved_at.sql`, among
others) are **absent from `0099_snapshot.json`**, even though their SQL migrations
were already applied. Running `drizzle-kit generate` naively from `schema.ts` as of
`0099` therefore regenerates `CREATE TABLE`/`ALTER TABLE` statements for
already-existing structures — if applied, this would fail outright (`table already
exists`) against any real database that has run migrations through `0099`.

This almost certainly originates from the `b652ea7b` merge commit ("Merge
origin/feat/todo-list; renumber colliding drizzle migrations"), which renumbered
colliding migration files from two branches but did not reconcile their snapshot
chains — the todo-list branch's snapshots were kept as-is and don't include the other
branch's tables/columns, even though both branches' SQL files were kept and renumbered
in sequence.

This does **not** affect `migrate()` replay (tests, `pnpm db:migrate`) — that just
applies the numbered SQL files in order regardless of snapshot content, and all
migrations 0000–0099 are present and correct on disk. It only affects **future**
`pnpm db:generate` invocations, which diff `schema.ts` against the (incomplete)
snapshot chain.

This migration (`0100_add_page_annotations`) was therefore **hand-written** rather
than taken as-is from `drizzle-kit generate`'s raw output: the auto-generated file
was discarded, and a minimal, correct `CREATE TABLE pageAnnotations` migration plus a
snapshot that layers only the new table on top of `0099_snapshot.json` were written
by hand instead, to avoid entangling an unrelated, pre-existing repo issue into this
feature's migration. The underlying snapshot-chain gap remains and should be repaired
separately (likely by reconciling `0099_snapshot.json` against the cumulative state of
all applied migrations through `0099`, which no one in the `feat/todo-list` merge did).
