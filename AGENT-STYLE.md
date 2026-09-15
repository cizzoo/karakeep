# AGENT-STYLE.md

This file documents the visual and code-level styling conventions of the Karakeep **web app**
(`apps/web`), so that new features look and behave like they were built by the same team.
Read this before adding or changing any UI. Scope: `apps/web` and the primitives it shares with
other apps via `packages/shared-react`. `apps/landing` (marketing site) and `apps/mobile`
(NativeWind/Expo) have their own, separate conventions and are out of scope here.

## 1. Design tokens & theming

- All colors are HSL CSS custom properties defined once in `tooling/tailwind/globals.css`
  (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`,
  `--destructive`, `--border`, `--input`, `--ring`, `--radius`), with a `.dark` block overriding
  them for dark mode. Dark mode is class-based (`darkMode: ["class"]` in
  `tooling/tailwind/base.ts`) and toggled by `next-themes` (see `apps/web/components/ui/sonner.tsx`
  for an example of reading the active theme).
- `tooling/tailwind/base.ts` maps every token to a Tailwind color (`bg-primary`,
  `text-muted-foreground`, `border-border`, etc.). **Always style with these semantic tokens**,
  never raw Tailwind palette colors (`slate-500`, `gray-100`, ...) for anything that should adapt
  to dark mode. A few older components (e.g. `NoBookmarksBanner.tsx`) hardcode
  `bg-slate-50 dark:bg-slate-700/50`-style pairs — this is legacy and should not be copied; prefer
  `bg-muted`, `text-muted-foreground`, `bg-accent`, etc.
- `apps/web/tailwind.config.ts` just imports the shared preset (`@karakeep/tailwind-config/web`,
  which lives at `tooling/tailwind/web.ts`) and extends `content`. Don't duplicate token
  definitions in app-level config — add new tokens/keyframes to the shared preset if they need to
  be reused.
- Border radius is driven by `--radius` (`0.5rem`) via `rounded-lg`/`rounded-md`/`rounded-sm`
  (mapped to `var(--radius)` and derivatives in `web.ts`). Default corner rounding for
  cards/dialogs/popovers is `rounded-lg`; buttons/inputs use `rounded-md`.
- Animations: `tailwindcss-animate` plugin drives Radix `data-[state=...]` transitions
  (`data-[state=open]:animate-in data-[state=open]:fade-in-0 ...`) — this is the standard way
  dialogs/popovers/dropdowns animate in/out. Bespoke keyframes (`accordion-down/up`,
  `pulse-border`) live in `tooling/tailwind/web.ts`.

## 2. Component layers

There are two places UI primitives live — know which one to touch:

- **`apps/web/components/ui/`** — shadcn/ui primitives generated with `components.json`
  (`style: default`, `baseColor: slate`, `iconLibrary: lucide`, no class prefix). Radix-based
  (`dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tabs.tsx`, `select.tsx`, ...), plus a few
  project-specific composites built on top of them: `action-button.tsx`,
  `action-confirming-dialog.tsx`, `multiple-choice-dialog.tsx`, `copy-button.tsx`,
  `file-picker-button.tsx`, `full-page-spinner.tsx`, `info-tooltip.tsx`, `kbd.tsx`,
  `relative-time.tsx`, `formatted-date.tsx`.
- **`packages/shared-react/components/ui/`** — the subset of primitives shared across apps
  (currently `button.tsx`, `popover.tsx`, `textarea.tsx`). `apps/web` re-exports these
  (see `apps/web/components/ui/button.tsx`, which just re-exports
  `@karakeep/shared-react/components/ui/button` and adds a `ButtonWithTooltip` wrapper). If a
  primitive needs to be usable outside the web app, put/extend it in `shared-react`, not
  `apps/web`; if it's web-only, it belongs directly in `apps/web/components/ui`.
- Feature components live under `apps/web/components/<area>/` (e.g. `dashboard/bookmarks/`,
  `settings/`, `shared/sidebar/`), one component (or a small tightly-coupled family) per file,
  PascalCase filenames (`BookmarkCard.tsx`, `LinkCard.tsx`), default-exported for the "main"
  component of a file.

### Primitive component pattern (shadcn style)

Every base primitive follows the same shape — match it exactly when adding a new one:

```tsx
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
  ),
);
Card.displayName = "Card";
```

- `React.forwardRef` + explicit `displayName`.
- `className` is always the *first* prop spread through `cn(<defaults>, className)`, letting
  callers override/extend styles positionally.
- Variants are expressed with `class-variance-authority` (`cva`), not conditional string
  concatenation — see `packages/shared-react/components/ui/button.tsx` for the canonical example
  (`variant`: `default | destructive | destructiveOutline | outline | secondary | ghost |
  ghostDestructive | border | link | none`; `size`: `default | sm | lg | icon | none`).
- Compound components (Card, Dialog, Form, ...) export each part as a separate named component
  (`CardHeader`, `CardTitle`, `CardContent`, `CardFooter`, ...) rather than accepting slot props.

## 3. Utility-class conventions

- Always merge classes with `cn()` from `apps/web/lib/utils.ts` (`clsx` + `tailwind-merge`), never
  template-string concatenation. Signature is `cn(<internal defaults>, className)`.
- No component-scoped CSS files/CSS modules and no `styled-components`. Everything is Tailwind
  utility classes directly in JSX; `tooling/tailwind/globals.css` is only for base layer resets,
  CSS variables, and the couple of pseudo-element rules Tailwind can't express (scrollbar styling,
  under `@layer components`).
- Common spacing/typography idioms seen throughout the codebase:
  - Page title: `text-2xl font-semibold tracking-tight`; section/card title: `text-lg font-semibold`.
  - Secondary/help text: `text-sm text-muted-foreground`.
  - Vertical rhythm between stacked blocks: `space-y-4` / `space-y-5` on the container rather than
    margins on children.
  - Icon buttons and small icons default to `h-4 w-4` (or the Tailwind 3.4+ shorthand `size-4`);
    `size-10` for a square icon-only button (`size="icon"` button variant).

## 4. Icons

- Icon library is exclusively **`lucide-react`** (matches `components.json`'s `iconLibrary`).
- Simple icons take `className` for sizing/color (`<X className="size-4" />`).
- Icons that represent a toggleable state take explicit `size`/`strokeWidth`/`className` props and
  switch which lucide icon (and sometimes fill color) is rendered based on the boolean, rather than
  rotating/masking a single icon — see `apps/web/components/dashboard/bookmarks/icons.tsx`
  (`FavouritedActionIcon` swaps `Star` fill, `ArchivedActionIcon` swaps `Archive`/`ArchiveRestore`).
- Empty-state icons are wrapped in a circular tinted badge: `h-16 w-16 rounded-full bg-muted`
  containing an `h-8 w-8 text-muted-foreground` icon (see `NoBookmarksBanner.tsx`, using semantic
  tokens rather than the hardcoded slate values that file currently has).

## 5. Forms

Standard stack for any new form: **react-hook-form + zod + shadcn `Form` wrapper + tRPC mutation +
`ActionButton`**.

1. Validation schema comes from `@karakeep/shared/types/*` (e.g. `zChangePasswordSchema`) — reuse
   the shared zod schema rather than redefining validation in the component.
2. `useForm({ resolver: zodResolver(schema), defaultValues: {...} })`.
3. Wrap fields in `<Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">`.
4. Each field: `FormField` → `FormItem className="space-y-2"` → `FormLabel` → `FormControl` →
   input → `FormMessage`.
5. Submit button is `ActionButton` (`apps/web/components/ui/action-button.tsx`), passing
   `loading={mutation.isPending}` — it swaps children for a spinner and auto-disables while
   loading, and also auto-disables in demo mode (`useClientConfig().demoMode`) unless
   `ignoreDemoMode` is set. Don't hand-roll a disabled/spinner button.
6. Layout multi-field rows with `grid gap-4 md:grid-cols-2`; align the submit button right with a
   trailing `<div className="flex justify-end">`.

See `apps/web/components/settings/ChangePassword.tsx` as the reference implementation.

## 6. Data fetching / mutations

- tRPC v11 client hook: `const api = useTRPC()` from `@karakeep/shared-react/trpc`, then
  `useQuery(api.<router>.<proc>.queryOptions(input))` / `useMutation(api.<router>.<proc>.mutationOptions({...}))`
  from `@tanstack/react-query`. Don't call the older `api.<router>.<proc>.useQuery()` hook form —
  this codebase uses the `queryOptions`/`mutationOptions` pattern throughout.
- Reusable data operations are wrapped as hooks in `packages/shared-react/hooks/` (e.g.
  `useDeleteBookmark`) and consumed directly rather than re-deriving the mutation in every
  component.
- `onSuccess`/`onError` on the mutation is where user feedback (toast) and side effects (redirect,
  form reset, closing a dialog) happen — not in the submit handler.

## 7. Feedback: toasts

- Import `toast` from `apps/web/components/ui/sonner.tsx`, call it with an object:
  `toast({ description: t("toasts.bookmarks.deleted") })` for success and
  `toast({ variant: "destructive", description: "..." })` for errors. This is the dominant
  pattern (~55 call sites) — use it for new code even though the file's own comment marks it
  `@deprecated` in favor of native `sonner` (`toast.success(...)`/`toast.error(...)`, used in a
  handful of newer files). Match the existing majority convention unless the user asks you to
  migrate toasts wholesale.
- The `Toaster` itself is theme-aware (via `next-themes`) and maps semantic icon slots
  (`success`/`info`/`warning`/`error`/`loading`) to lucide icons — don't pass custom icons per-call.

## 8. Dialogs & confirmations

- Base `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter`/etc. come from
  `apps/web/components/ui/dialog.tsx` (Radix `Dialog` primitive, centered, `sm:rounded-lg`,
  built-in close `X` button in the top-right unless `hideCloseBtn`).
- For "confirm this action" flows (especially destructive ones), don't build a raw `Dialog` —
  use `ActionConfirmingDialog` (`apps/web/components/ui/action-confirming-dialog.tsx`). It takes
  `title`, `description`, and an `actionButton(setDialogOpen)` render prop, and always renders a
  secondary "Close" button plus your action button in the footer (`sm:justify-end`).
- The action button inside a confirmation dialog is an `ActionButton` with
  `variant="destructive"` for destructive actions, wired to a tRPC mutation's `isPending`.
  See `DeleteBookmarkConfirmationDialog.tsx`.

## 9. Internationalization

- **Every user-facing string must go through i18next**, never hardcoded English in JSX (a few
  legacy strings like `"Delete"` / `"Something went wrong"` exist but are not the pattern to
  copy).
- `const { t } = useTranslation()` from `@/lib/i18n/client`; keys are namespaced dot-paths such as
  `settings.info.current_password`, `dialogs.bookmarks.delete_confirmation_title`,
  `toasts.bookmarks.deleted`, `banners.no_bookmarks.title`, `actions.save` /
  `actions.close`.
- Translation JSON lives under `apps/web/lib/i18n/locales/<lang>/*.json`, one namespace/file per
  language directory (`ar`, `cs`, `da`, `de`, `el`, ...). When adding a new string, add the key to
  the English locale (source of truth) — you do not need to translate into every other language
  yourself.

## 10. Page / section layout

- Settings-style pages are built from `SettingsPage` (page title + optional description/action
  header) and `SettingsSection` (a `Card` with an optional `CardHeader`/title/description/action
  and `CardContent`) — both in `apps/web/components/settings/SettingsPage.tsx`. A `variant="danger"`
  on `SettingsSection` tints the title/border for destructive sections (e.g. "Delete account").
  Reuse these two components for any new settings-like screen instead of hand-building a `Card`.
- The container query defaults (`tooling/tailwind/base.ts`) center content with `2rem` padding and
  cap width at `1400px` at the `2xl` breakpoint — respect this when adding full-width sections.
- Sidebar navigation items (`apps/web/components/shared/sidebar/SidebarItem.tsx`) follow the
  active/inactive pattern: active = `bg-accent/50 text-foreground`, inactive =
  `text-muted-foreground`, hover = `hover:bg-accent`, with `rounded-lg` on the `<li>` and
  `rounded-[inherit]` on the inner `<Link>` so the hover/active background isn't double-clipped.

## 11. Import & file conventions

- Path alias `@/*` → `apps/web/*` (see `apps/web/tsconfig.json`). Use `@/components/...`,
  `@/lib/...` for anything inside the web app; use the `@karakeep/*` package names
  (`@karakeep/shared`, `@karakeep/shared-react`, `@karakeep/tailwind-config`) for cross-package
  imports.
- Interactive components (state, effects, event handlers, Radix primitives) start with
  `"use client";` as the first line. Server components omit the directive.
- Icon-swap / small stateless helper components can be grouped in an `icons.tsx` next to the
  feature that owns them rather than going into the generic `ui/` folder (see
  `dashboard/bookmarks/icons.tsx`).

## 12. What NOT to do

- Don't introduce a new styling system (CSS Modules, styled-components, Emotion, inline `style=`
  objects for anything expressible in Tailwind).
- Don't hardcode raw palette colors for anything themeable — always go through the semantic
  tokens (`background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`,
  `destructive`, `border`, `input`, `ring`).
- Don't build ad-hoc spinners/disabled-state buttons — use `ActionButton`.
- Don't hand-roll confirm dialogs for destructive actions — use `ActionConfirmingDialog`.
- Don't hardcode UI copy — go through `t("...")` and add the key to the English locale file.
- Don't add a new base UI primitive under `apps/web/components/ui` if it needs to be shared with
  other apps — put it in `packages/shared-react/components/ui` instead.
