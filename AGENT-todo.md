# AGENT-todo.md

This file documents the **Todo Lists** feature (introduced in commit `5fc99e82`,
`feat(todos): add todo lists and items functionality`) so that future agents understand how it
was built, why it's structured that way, and what still needs to be finished. Read this before
touching anything under `todoLists`/`todoItems`/`todos`.

## 1. What the feature is

Users can create todo lists (name + emoji icon), each containing an ordered set of text items
that can be checked off, edited, reordered and deleted. It lives in the dashboard at
`/dashboard/todos` (list of all todo lists) and `/dashboard/todos/[todoListId]` (single list with
its items), with a nav entry added in `apps/web/app/dashboard/layout.tsx`.

## 2. How it was built — the layering pattern

The feature follows the same repo/service/router layering used by other resources in this
codebase (e.g. `bookmarkLists`). Read top-to-bottom when tracing a change; each layer only talks
to the one below it:

1. **Schema** — `packages/db/schema.ts`: `todoLists` (`id`, `name`, `icon`, `userId`,
   `createdAt`, `modifiedAt`) and `todoItems` (`id`, `todoListId`, `text`, `done`, `position`
   (`real`), `createdAt`, `modifiedAt`), both cascade-deleted from their parent (`users` /
   `todoLists`). Migration: `packages/db/drizzle/0085_add_todo_lists.sql`.
2. **Validation** — `packages/shared/types/todos.ts`: Zod schemas for every input/output shape
   (`zNewTodoListSchema`, `zEditTodoListSchema`, `zTodoItemSchema`, `zReorderTodoItemsSchema`,
   etc.), each with length limits (`MAX_TODO_LIST_NAME_LENGTH`, `MAX_TODO_ITEM_TEXT_LENGTH`).
3. **Repo** — `packages/trpc/models/todoLists.repo.ts`: raw Drizzle queries only, no
   authorization logic. Notably computes `itemsCount`/`doneCount` via a `leftJoin` + `GROUP BY`
   with SQL `COUNT`/`SUM(CASE WHEN done ...)` expressions rather than loading all items.
4. **Service** — `packages/trpc/models/todoLists.service.ts`: wraps the repo and enforces
   ownership using the shared `Actor`/`authorize`/`assertOwnership` helpers from
   `packages/trpc/lib/actor.ts` — the same pattern used elsewhere in the app. Returns an
   `Authorized<T>`-wrapped resource once ownership is confirmed.
5. **Router** — `packages/trpc/routers/todoLists.ts`: a scoped tRPC router
   (`createScopedAuthedProcedure("todoLists")`, which required adding `"todoLists"` to
   `API_KEY_SCOPE_RESOURCES` in `packages/shared/types/apiKeys.ts` and to the scopes UI in
   `apps/web/components/settings/apiKeyScopes.ts`). Ownership checks for mutations/queries that
   take a `todoListId`/`todoItemId` are centralized in two `experimental_trpcMiddleware`
   instances (`ensureTodoListOwnership`, `ensureTodoItemOwnership`) rather than repeated per
   procedure. A `get` query (single todo list by id) reuses `ensureTodoListOwnership` and just
   returns `ctx.todoList`, the same way `edit`/`delete` do.
6. **React hooks** — `packages/shared-react/hooks/todoLists.ts`: one `useQuery`/`useMutation`
   pair per router procedure (including `useTodoList` for the single-item `get` query), each
   mutation invalidating the relevant `@tanstack/react-query` caches on success (list, `getItems`
   for the affected list, and — for edit/delete — the single-item `get` cache too, so a header
   subscribed only to `get` doesn't go stale after a rename or delete).
7. **UI** — `apps/web/components/dashboard/todos/*` and
   `apps/web/app/dashboard/todos/**`. Server components (`page.tsx`) do the initial
   `api.todoLists.*` fetch and pass it as `initialData` into client components, which then
   re-hydrate via the hooks above. Follows `AGENT-STYLE.md` conventions (semantic color tokens,
   shadcn primitives, `ActionButton`/`toast` patterns).

Reordering (`reorderItems`) takes the full ordered array of item ids and, inside a single DB
transaction, writes each item's `position` to its array index — but only for items whose position
actually changed, skipping no-op writes. It's driven from the UI by up/down chevron buttons in
`TodoItemRow.tsx` (see `TodoItemsList.tsx`'s `swap()`), not drag-and-drop — there is no
drag-and-drop library in this repo at all, so this matches the rest of the app. In practice that
means an adjacent-item swap only touches the 2 rows that moved instead of rewriting the whole
list.

Tests: `packages/trpc/routers/todoLists.test.ts` covers create, add item, toggle done, reorder,
delete item, delete list, and cross-user privacy (each mutation/query must reject a second user
with "User is not allowed to access resource").

## 3. Follow-ups since the initial build

Several things landed on top of the layering described above, following the exact same
repo/service/router/hooks/UI pattern:

- **A single-item `get` query** (`todoLists.get`, keyed by `todoListId`, gated by
  `ensureTodoListOwnership`), with a matching `useTodoList` hook.
- **Tagging** — todo lists can now be tagged, reusing the exact same `bookmarkTags` pool
  bookmarks use (join table `tagsOnTodoLists`, shared tag-resolution helpers in
  `packages/trpc/lib/tags.ts`, UI via `TodoListTagsEditor.tsx` wrapping the bookmark `TagsEditor`).
  There's no separate "todo tags" concept.
- **Linking existing bookmarks to a todo list** — a todo list can now attach/detach existing
  bookmarks (join table `bookmarksInTodoLists`, modeled as an ordinary many-to-many table like
  `bookmarksInLists`, so a reverse lookup is cheap to add later) and show them on its detail page
  (`todoLists.getLinkedBookmarks`/`attachBookmark`/`detachBookmark`, hydrated into full
  `ZBookmark`s via `Bookmark.loadMulti` rather than re-deriving bookmark rendering data;
  `LinkedBookmarksSection.tsx` + `BookmarkPicker.tsx` on the web UI). **This is the forward
  direction only** (todo list → its linked bookmarks) — a bookmark's own page/UI does not yet show
  which todo lists reference it back; that reverse direction is deferred to a later task.
- **Tagging and bookmark-linking, one level down on items** — todo *items* (not just lists) can
  now be tagged (`updateItemTags`, `TodoItemTagsEditor.tsx`) and linked to bookmarks
  (`getLinkedBookmarksForItem`/`attachBookmarkToItem`/`detachBookmarkFromItem`,
  `LinkedBookmarksSectionForItem.tsx`), reusing the exact same shared tag pool and the same
  forward-only bookmark-linking model as lists. `BookmarkPicker.tsx` (renamed from
  `BookmarkTodoListPicker.tsx`) and the `LinkedBookmarksGrid` it's paired with in
  `LinkedBookmarksSection.tsx` are genuinely scope-agnostic and are shared as-is between the
  list- and item-level sections rather than duplicated.
- **Items can move between lists** — `todoLists.moveItem` (`{todoItemId, targetTodoListId}`,
  hook `useMoveTodoItem`) reassigns an item to a different list the same user owns; ownership of
  the target list is verified server-side.
- **Unified item create/edit dialog** — `EditTodoItemDialog.tsx` is now the sole way to create or
  edit a todo item (name, list, tags, linked bookmarks), replacing the old quick-add input in
  `TodoItemsList.tsx` and the click-to-inline-edit text in `TodoItemRow.tsx` (which still handle
  the `done` checkbox, reordering, and delete directly, unchanged). Since a new item has no id
  until `addItem` succeeds, a successful create transitions the dialog in place into editing the
  just-created item instead of closing, so tags/bookmarks can be attached immediately.

## 4. Remaining work

The feature works end-to-end but is not finished. In rough priority order:

1. **Not exposed outside the web app.** Every other first-class resource (e.g. bookmark lists,
   see `packages/open-api/lib/lists.ts`) has REST/OpenAPI coverage; todo lists have none —
   nothing in `packages/open-api`, `packages/sdk`, `apps/mcp`, or `apps/cli` knows about them.
   If todos are meant to be usable outside the dashboard UI, these layers still need adding.
2. **Missing test coverage** in `todoLists.test.ts`: editing a list's name/icon, Zod validation
   failures (empty/too-long name or item text), cascade-delete of items when a list is deleted,
   and an API-key **scope-restriction** test (other resources — e.g.
   `packages/trpc/routers/bookmarks.test.ts` — assert that a key scoped without a resource can't
   use it; `todoLists` has no equivalent).
3. **`position` is a `real` but isn't used as one.** The column is a float, which usually exists
   so a single move can slot an item between two neighbors' positions in O(1). `reorderItems`
   now skips the `UPDATE` for any item whose position wouldn't actually change (so an
   adjacent-item swap driven by the up/down chevrons only writes the 2 rows that moved, not the
   whole list), but it still takes the *full* ordered array of ids as its only input — there's no
   single-item "move to position X" API — so the caller-side cost of building that array, and the
   worst case where every item's position does change, are both still O(n). True O(1)
   fractional-midpoint inserts (using the `real` column to slot an item between its two neighbors
   without touching anyone else) are still not implemented.
4. **i18n: English only.** All new strings (`todos.*`, `toasts.todos.*`, the
   `settings.api_keys.scopes.resources.todoLists.*` scope copy, and the `common.todos` nav label)
   were only added to `apps/web/lib/i18n/locales/en/translation.json`. Other locale files were not
   updated.
