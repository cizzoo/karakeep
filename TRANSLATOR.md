# Karakeep: "Translate to English" for archived (SingleFile) pages

Implementation brief for a coding agent with full access to the Karakeep fork repository.

---

## 0. How to read this brief

- You (the agent) have the repository; the author of this brief did not look at the code. Every statement about Karakeep internals is an **assumption** and is tagged **[VERIFY]**. Confirm it by searching the code before relying on it.
- Design choices tagged **[DEFAULT]** were made on purpose. Follow them unless the code makes them impractical; in that case stop and explain the conflict before improvising.
- The translation server is documented in `API.md` (llama-swap in front of llama-server, model `translator`, Qwen3.8-27B). Read it in full before writing the client. This brief only repeats the parts that drive design decisions.
- Before writing any code, complete the discovery phase (section 3) and post a short findings note plus an implementation plan. Then implement in the milestone order of section 15.

---

## 1. Goal

The user's Karakeep fork already shows an archived page (SingleFile / full-page archive) inside a dedicated frame in a reading view, with a button that toggles a highlighting mode on and off.

Add, in the same toolbar area, a **Translate** control that:

1. Sends the archived page's text to the self-hosted `translator` model on the node **scirocco** (reachable over Tailscale).
2. Rebuilds a translated copy of the archived HTML **without breaking anything**: same layout, styles, images, links, code blocks, embedded resources.
3. **Replaces the stored archive with the translated one.** From then on the bookmark behaves as if the English page were the original archive: the frame, the highlight mode, export and every other feature work on the English page. There is no Original/English toggle.

The original archive is **deleted** after a successful swap: no backup is kept (explicit user decision). The bookmark keeps its URL, which is the only link to the original page. Getting the original back means archiving the page again from that URL with the existing Karakeep mechanisms (re-crawl, or a new SingleFile save). The translation is therefore one-way, and the confirmation dialog must say so.

Target language is English. Source language is whatever the page is in (most commonly Chinese, but do not hard-code it).

---

## 2. Context

### 2.1 Karakeep (upstream facts, all [VERIFY])

- Monorepo: `apps/web` (Next.js UI + API routes), `apps/workers` (background jobs), `packages/db` (Drizzle ORM on SQLite), `packages/trpc` (tRPC routers), `packages/shared` (config, types, queues, asset store), possibly `packages/shared-server`.
- Background work runs through a SQLite-backed job queue (liteque) with dedicated worker runners in `apps/workers`.
- Archived pages are stored as **assets** in the asset store, with an asset-type enum on an `assets` table. Relevant types are probably `precrawledArchive` (SingleFile uploads) and `fullPageArchive` (crawler/monolith archives).
- Assets are served to the browser by an API route like `/api/assets/[assetId]`, with specific headers (content type, possibly CSP/sandbox).
- There is already an OpenAI-compatible inference integration (`OPENAI_BASE_URL`, `INFERENCE_TEXT_MODEL`, …) used for tagging/summaries. **Do not reuse it** for translation (see section 11).

### 2.2 The fork's custom work [VERIFY]

The highlight mode in the archive viewer is a custom extension of this fork, not upstream code. Find it (section 3) and understand:

- how the archive frame is rendered (iframe `src` vs `srcdoc`, sandbox attributes, injected scripts),
- how highlights are anchored (text offsets, XPath, text-quote selectors, …) and what they are keyed on (bookmark id, asset id, …): this decides what happens to pre-existing highlights when the archive is replaced (section 10),
- how the toggle button is wired, so the new control matches its style and placement.

### 2.3 The translator (from `API.md`)

| Fact | Consequence |
|---|---|
| OpenAI-compatible `POST $ROOT/v1/chat/completions`, `model: "translator"` | Plain `fetch` or the `openai` SDK both work. |
| Auth via `Authorization: Bearer <KEY>` | Key lives only on the server side. |
| Reachable **only over Tailscale** | The browser must never call it. Calls go from the Karakeep workers container. |
| Model unloads after 10 min idle; first request blocks ~15 s while loading; 5xx if loading exceeds 180 s | Long client timeouts, retries, "warming up" state in UI. |
| `GET /v1/models` returns `status.value` = `loaded`/`unloaded` without triggering a load | Cheap pre-flight to show "warming up model". |
| Qwen thinks by default | Always send `chat_template_kwargs: {"enable_thinking": false}`. |
| `temperature 0.3` used in the benchmark | Use it as default. |
| 32k context split across 2 slots (`--parallel 2`), ~16k tokens per request | Keep prompt + output well below 16k; at most 2 concurrent requests. |
| Placeholder convention `<x1>…</x1>`, `<x2/>` already validated in the benchmark | Reuse it for inline markup (section 5.3). |
| `/unload` endpoints interrupt running work | **Never call them.** |
| `/upstream/translator/tokenize` exists (it loads the model) | Optional for exact token counting; a heuristic is fine for v1. |

Observed throughput in the sample response is ~32 tokens/s per slot. A typical long article (4–6k output tokens) should take roughly 1.5–4 minutes plus cold start. The job must be asynchronous with visible progress.

---

## 3. Discovery phase (do this first)

Locate the following and summarise findings (file paths + one line each) before coding. Search hints are starting points, not guarantees.

| What | Search hints |
|---|---|
| Archive asset types and how the viewer picks which archive to show | `rg -n "precrawledArchive\|fullPageArchive" apps packages` |
| How a bookmark resolves "its" archive (lookup by asset type? a column on the bookmark/link row?). This defines how the swap is done (section 6.3) | same as above, plus the bookmark/link tables in `packages/db` |
| Everything **derived from the archive** at ingestion: reader/HTML content extracted from a SingleFile upload, plain text for search, word count, AI tags/summary input | `rg -ni "readability\|htmlContent\|precrawled" apps/workers packages`; search-index worker |
| Every other consumer of the archive asset (export, download, mobile API, REST API) | `rg -n "<archive asset type names>" apps packages` |
| SingleFile ingestion | `rg -ni "singlefile" apps packages` |
| Archive viewer component and its iframe | `rg -n "iframe" apps/web/components apps/web/app` |
| The fork's highlight feature (UI, storage, anchoring) | `rg -ni "highlight" apps/web packages/trpc packages/db`; `git log --oneline --all -- <viewer files>` to find the fork's commits |
| Assets table / enum, asset store helpers | `rg -n "assetType" packages/db`; `rg -n "saveAsset\|readAsset\|newAssetId\|deleteAsset" packages` |
| Asset serving route and its headers | `apps/web/app/api/assets/` |
| Queue definitions and worker registration | `rg -n "LiteQueue\|new Runner\|Queue<" packages apps/workers` |
| Server config (zod env parsing) and what is exposed to the client | `rg -n "OPENAI_BASE_URL" packages/shared`; `rg -n "clientConfig\|serverConfig" apps/web packages` |
| Existing inference client (for patterns only) | `rg -n "chat.completions\|OpenAI(" packages apps/workers` |
| HTML parsing libraries already in deps | `rg -n "\"(jsdom\|linkedom\|cheerio\|parse5\|htmlparser2\|@mozilla/readability)\"" -g package.json` |
| Test framework and conventions | `rg -n "vitest\|jest" -g package.json` |
| Migration workflow | `packages/db` scripts, `drizzle.config.*`, existing `drizzle/` migrations |
| Deployment (compose files, how workers container reaches the network) | `docker/`, `docker-compose*.yml`, any `.env.sample` |

Stop and ask the user if:

- the highlight implementation would be broken by swapping the iframe content (e.g. it mutates the stored archive),
- the bookmark's archive cannot be swapped to a different asset atomically (e.g. the asset id is baked into places that cannot be updated in one transaction),
- the workers container clearly cannot reach a Tailscale IP and fixing that is outside the repo.

---

## 4. Architecture overview

```
 Browser (archive viewer)
   │  click "Translate"
   ▼
 tRPC: bookmarks.translateArchive ──► DB: archive_translations row (status=pending)
   │                                   Queue: TranslationQueue.enqueue({ translationId })
   │  poll tRPC: bookmarks.getArchiveTranslation (status, progress)
   ▼
 apps/workers: translation worker
   1. read source archive asset (HTML)
   2. parse → segment → encode placeholders
   3. batch → POST scirocco /v1/chat/completions (≤2 in flight)
   4. validate → reconstruct DOM → serialize
   5. save new asset (translated HTML)
   6. one DB transaction: translated asset becomes the bookmark's archive,
      original asset row removed, row marked done; then delete the original file
   7. regenerate archive-derived data (reader content, search index)
   ▼
 Browser: viewer reloads the archive, which is now the English page
```

Key properties:

- The browser never talks to scirocco and never sees the API key.
- The original file is never edited in place: the translated archive is written as a new asset and swapped in atomically. The original is deleted only **after** the swap has been committed, so a failure at any earlier point leaves the original archive intact.
- The translation pipeline (sections 5.1–5.9) is a **pure, network-free library** plus a thin HTTP client, so it can be tested in isolation.

---

## 5. Translation pipeline

### 5.1 Load the source

Read the archive asset that the viewer currently displays for this bookmark. Reuse the exact selection logic the viewer uses (do not duplicate it with different rules) so the user translates what they are looking at. Record its asset id as `originalAssetId`.

### 5.2 Parse

Requirements for the parser:

- No script execution, no resource loading (SingleFile pages embed large `data:` URIs and inline scripts).
- Faithful round-trip: doctype, the leading SingleFile comment, attributes, inline `<style>`, `<template>` contents must survive parse + serialize.
- Access to `<template>` content. SingleFile serializes shadow DOM as declarative shadow roots (`<template shadowrootmode="open">`, older versions `shadowroot="open"`). Text inside them is visible on the page and must be translated. Note that in DOM-style libraries `querySelector` does not descend into `template.content`; traverse it explicitly.

Prefer a library already in the repo [VERIFY]. If choosing new: `parse5` (spec-compliant, faithful serializer) or `linkedom` (light DOM API). Avoid `jsdom` for very large pages if memory becomes an issue. Avoid cheerio in XML mode.

**Invariant to test:** parse → serialize with no translation produces a document that is DOM-equivalent to the original and renders identically.

### 5.3 Segmentation

A **translation unit** is a run of inline content (text nodes + inline elements) that reads as one block of prose.

Algorithm [DEFAULT]:

1. Walk the tree from `<body>` (plus `<title>` and selected attributes, see 5.3.3), skipping excluded subtrees (5.3.1).
2. For an element whose descendants contain **no block-level element**, if it has translatable text, it is one unit (its children are the unit content).
3. For an element with mixed content (block children plus loose text/inline siblings, e.g. `<div>text <b>x</b><p>…</p> more text</div>`), each maximal run of consecutive inline/text children between block children is an **anonymous unit**. Reconstruction replaces exactly that run of nodes.
4. Block-level is decided by tag name (no computed styles available): `address article aside blockquote body caption dd details dialog div dl dt fieldset figcaption figure footer form h1–h6 header hgroup hr li main nav ol p section summary table tbody thead tfoot tr td th ul` and similar. Everything else is inline.
5. A unit is **skipped** (left untouched, not sent) if its text has no Unicode letters (`\p{L}`), e.g. numbers, punctuation, emoji only.
6. If the page's dominant script is non-Latin (CJK, Cyrillic, Arabic, …), also skip units whose letters are ≥95% ASCII: those are usually identifiers, code, or already-English quotes. If the dominant script is Latin, send everything; the prompt tells the model to return English text unchanged.
7. Whitespace: strip leading/trailing whitespace of the unit before sending and re-attach it verbatim afterwards. Collapse internal runs of whitespace to one space when sending (the browser collapses them anyway outside `pre`).

#### 5.3.1 Never translate (excluded subtrees)

`script style noscript iframe object embed canvas video audio svg math textarea select option input pre code kbd samp var tt rt rp`, any element with `translate="no"`, class `notranslate`, or the `hidden` attribute, and `<template>` elements that are **not** declarative shadow roots.

Note: `<code>` inside a paragraph is not a unit boundary; it becomes a verbatim placeholder (5.4). `<pre>` blocks are excluded entirely.

#### 5.3.2 Ruby annotations

For `<ruby>`, translate the base text as part of the surrounding unit and drop nothing; `<rt>`/`<rp>` are excluded and kept as void placeholders.

#### 5.3.3 Attributes and title [DEFAULT]

Also translate, as standalone plain-text units (no placeholders): `<title>`, `img[alt]`, `[title]`, `[aria-label]`. Do not translate `meta` contents, `href`, `src`, or any other attribute.

### 5.4 Placeholder encoding

Inside a unit, inline elements are replaced with numbered placeholders, numbering per unit starting at 1 with one shared counter.

| Original | Placeholder | Reconstruction |
|---|---|---|
| Paired inline element with translatable text: `a abbr b bdi bdo cite del dfn em font i ins label mark q s small span strong sub sup time u` | `<xN>…</xN>` (content recursively encoded) | Shallow-clone the original element (all attributes), fill it with the reconstructed translated children. |
| Inline element without text, or excluded inline element: `br img wbr rt rp`, inline `svg`/`math`, empty `span`, … | `<xN/>` | Deep-clone the original element verbatim. |
| Verbatim inline element: `code kbd samp var tt` | `<cN>original text</cN>` | Deep-clone the original element verbatim; ignore whatever the model put inside. |

The `cN` form gives the model context (e.g. to choose "an eBPF program" correctly) while guaranteeing the content is not altered.

Escaping: in the encoded string, the only markup allowed is `seg`, `xN`, `cN`. Escape literal `&`, `<`, `>` in text as `&amp;`, `&lt;`, `&gt;` before sending; decode entities in the model output when creating text nodes.

Example:

```text
Original HTML:
  <p>首先我们需要在<a href="/k">内核态</a>注册一个<code>eBPF</code>程序。<br>然后加载它。</p>

Encoded unit:
  首先我们需要在<x1>内核态</x1>注册一个<c2>eBPF</c2>程序。<x3/>然后加载它。

Expected model output:
  First, we need to register an <c2>eBPF</c2> program in <x1>kernel mode</x1>.<x3/>Then load it.

Reconstructed HTML:
  <p>First, we need to register an <code>eBPF</code> program in <a href="/k">kernel mode</a>.<br>Then load it.</p>
```

Placeholders may be reordered by the model; that is expected and correct.

### 5.5 Batching

- Group consecutive units (document order) into batches with a source budget of about **1,500 tokens** [DEFAULT, configurable]. Batching gives the model local context and cuts per-request overhead.
- Token estimate heuristic: ~1 token per CJK character, ~1 token per 4 characters otherwise, plus 30% margin. Exact counting via `/upstream/translator/tokenize` is optional.
- Set `max_tokens` to `min(TRANSLATION_MAX_OUTPUT_TOKENS, 3 × estimated input tokens + 256)` and make sure system prompt + input + `max_tokens` stays under ~14k.
- A single unit larger than the budget: split at sentence boundaries (`。！？!?.` followed by space or end) only at points where no `xN` pair is open; if no safe split point exists, send it alone in its own batch.

Batch payload format:

```text
<seg id="1">…encoded unit…</seg>
<seg id="2">…encoded unit…</seg>
```

### 5.6 Calling the translator

Request [DEFAULT]:

```json
{
  "model": "translator",
  "temperature": 0.3,
  "max_tokens": 2048,
  "stream": false,
  "chat_template_kwargs": {"enable_thinking": false},
  "messages": [
    {"role": "system", "content": "<system prompt below>"},
    {"role": "user", "content": "<seg id=\"1\">…</seg>\n<seg id=\"2\">…</seg>"}
  ]
}
```

System prompt (version it, see `promptVersion` in section 6):

```text
You are a professional translator. Translate the text of every segment into natural, fluent English.
The document title is: "{title}".

Rules:
1. Return exactly the same segments, with the same <seg id="N"> wrappers, in the same order, one output segment per input segment. Output nothing else: no notes, no explanations.
2. Keep every placeholder tag exactly as written: <xN>...</xN>, <xN/>, <cN>...</cN>. Same names, same count, properly nested. You may move placeholders to follow English word order.
3. Translate the text inside <xN>...</xN>. Copy the text inside <cN>...</cN> unchanged.
4. Keep URLs, file paths, numbers, code identifiers, product names and units unchanged.
5. If a segment is already in English, return it unchanged.
6. Keep &amp;, &lt; and &gt; as they are.
```

Client behaviour:

- **Pre-flight:** `GET $BASE_URL/models`. If `translator` is `unloaded`, set job phase `warming_up` so the UI can show it. Do not fail on pre-flight errors other than 401.
- **Concurrency:** at most `TRANSLATION_MAX_CONCURRENCY` (default 2) requests in flight, process-wide, not per job.
- **Timeout:** 300 s per request [DEFAULT]. The first request after idle blocks during model load.
- **Retries:** up to 3 with exponential backoff (5 s, 15 s, 45 s) on network errors, timeouts and 5xx. On 401 or 404, fail the job immediately with an explicit configuration error.
- **Never** call `/unload`, `/api/models/unload*`, or anything under `/upstream/` other than `tokenize` (optional).
- Strip any `<think>…</think>` block defensively before parsing, even with thinking disabled.

### 5.7 Validation and fallback

Per batch:

1. Parse the output into `seg` elements. If the batch has one segment and the model omitted the wrapper, accept the whole output as that segment.
2. If `finish_reason == "length"` or ids are missing/extra/duplicated: split the batch in halves and retry each half; recurse down to single units.

Per unit, the translation is accepted only if:

- it is non-empty,
- the multiset of placeholders matches the input exactly (`xN` pairs, `xN/` voids, `cN` pairs) and the nesting is well formed,
- no other tag-like markup is present (anything else is treated as invalid, not as text),
- the length ratio output/input (after removing placeholders) is within a sane band, e.g. 0.2–6 for units longer than 20 characters (CJK to English expands a lot in characters).

Fallback chain for a rejected unit [DEFAULT]:

1. Retry that unit alone at temperature 0.1.
2. If still invalid, **keep the original content of that unit untouched** and increment `failedUnits`.

The final document must always be valid. A partially translated page is acceptable; a broken page is not. If more than 20% of units fail, mark the job `failed` instead of saving a mostly untranslated page.

### 5.8 Reconstruction

- Parse each accepted translation into a small token tree (text, open `xN`, close `xN`, void `xN`, `cN`). Never feed model output into `innerHTML` or an HTML parser.
- Build replacement nodes: text → text node with decoded entities; `xN` pair → shallow clone of the original element with reconstructed children; `xN/` and `cN` → deep clone of the original element.
- Replace the unit's original child nodes (or the anonymous run) with the new nodes, re-attaching the original leading/trailing whitespace.
- Attribute units: set the translated string as the attribute value; `<title>`: replace its text.
- Set `<html lang="en">` and add `data-karakeep-translation="1"` on `<html>` [DEFAULT]. Optionally add `data-kk-unit="N"` on elements whose content was replaced (useful for debugging and future features). Do not add banners or visible elements to the page.

### 5.9 Serialize and store

Serialize with the same library, keep the doctype and the leading SingleFile comment, save as a new asset and swap it in (section 6.3). Content type identical to the original archive (`text/html` with the same charset handling) [VERIFY how originals are stored].

---

## 6. Data model and the swap

### 6.1 Asset types [VERIFY enum location]

- The translated archive is stored with **the same asset type as the original** (e.g. `precrawledArchive`). This is what makes every existing code path (viewer, highlights, asset route headers, export, APIs) treat it as the archive with no special-casing.
- No new asset type is needed.

### 6.2 New table `archive_translations` [DEFAULT]

| Column | Type | Notes |
|---|---|---|
| `id` | text pk | Same id style as other tables. |
| `bookmarkId` | fk → bookmarks, cascade delete | |
| `userId` | fk → users, cascade delete | If other tables carry it. |
| `targetLanguage` | text | `"en"` for now. |
| `originalAssetId` | text | The archive that was translated (no longer exists after the swap; kept for logging). |
| `translatedAssetId` | text nullable | The English archive once applied. |
| `status` | enum `pending \| running \| done \| failed \| cancelled` | |
| `phase` | text nullable | `warming_up`, `translating`, `saving`. |
| `progressDone` / `progressTotal` | int | Units processed / total. |
| `failedUnits` | int | |
| `model` | text | Value of `TRANSLATION_MODEL`. |
| `promptVersion` | int | Bump when the prompt or segmenter changes. |
| `error` | text nullable | Human-readable reason on failure. |
| `createdAt` / `updatedAt` | timestamps | |

Unique index on `(bookmarkId, targetLanguage)`. Generate the migration with the repo's standard Drizzle workflow.

### 6.3 The swap

Done by the worker once the translated HTML is ready:

1. Write the translated HTML to the asset store under a **new asset id**. Do not overwrite the original file in place: the asset route may send long-lived or immutable cache headers keyed on the id [VERIFY], and a separate file keeps the original intact until the commit.
2. Re-check that the bookmark's current archive is still `originalAssetId` (it may have been re-crawled during the job). If not, discard the translation and mark the row `failed` with a clear reason.
3. In **one DB transaction**: insert the new asset row with the original's archive type; delete the original asset row; if the bookmark references its archive through a column (instead of lookup by type), point it to the new asset id; update `archive_translations` (`translatedAssetId`, `status = done`); delete pre-existing highlights (section 10).
4. **After** the commit, delete the original file from the asset store using the existing asset-deletion helper [VERIFY].
5. If the transaction fails, delete the new file and leave everything as it was. A crash between steps 1 and 3 leaves an orphan translated file; a crash between 3 and 4 leaves an orphan original file. The existing orphan-cleanup job must be able to remove both [VERIFY that it exists and covers the asset store; if not, add a cleanup on worker start].

The bookmark URL, title and metadata are never changed. Only the archive asset is replaced.

### 6.4 Archive-derived data

Since the English page must behave like the original, anything Karakeep derived from the archive at ingestion must be regenerated from the translated archive after the swap, **using the same functions ingestion uses** (do not reimplement extraction). Typically [VERIFY]: reader/HTML content extracted from a SingleFile upload, plain text and word count, the search index (re-enqueue the indexing job).

[DEFAULT] Do **not** re-run AI tagging or summarisation: existing tags and summary stay as they are.

### 6.5 Re-crawl / refresh

If the bookmark is re-crawled and a new archive is produced in the original language, normal Karakeep behaviour applies (the new archive becomes current). Detect that the current archive is no longer `translatedAssetId` and show the bookmark as not translated again (Translate button visible). This is also the way to get the original back after a translation.

---

## 7. Job orchestration

- New queue `TranslationQueue` registered alongside the existing ones [VERIFY pattern], payload `{ translationId }`.
- Worker concurrency 1 (one page at a time; parallelism happens inside the job, capped at 2 requests).
- Job timeout generous (e.g. 60 min); queue-level retries 1, since the client already retries per request.
- Update `progressDone`, `phase` after each batch (throttle DB writes to at most one per second).
- Cancellation [DEFAULT, nice to have]: a `cancelled` status set by the UI is checked between batches; the worker stops, discards partial output, and the swap never happens.
- Dedup: enqueuing while a row is `pending`/`running` is a no-op returning the existing row.
- Do not translate a page that is already translated (current archive is `translatedAssetId`, or its `<html>` carries `data-karakeep-translation`).

---

## 8. API surface (tRPC)

Add to the bookmarks router (or a new `translations` router, whichever matches repo style), with the same ownership checks as existing bookmark procedures:

```ts
translateArchive(input: { bookmarkId: string }): TranslationStatus
getArchiveTranslation(input: { bookmarkId: string }): TranslationStatus | null
cancelArchiveTranslation(input: { bookmarkId: string }): void

type TranslationStatus = {
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  phase: "warming_up" | "translating" | "saving" | null;
  progressDone: number;
  progressTotal: number;
  failedUnits: number;
  isApplied: boolean;          // the bookmark's current archive is the translated one
  highlightsOnArchive: number; // used by the confirmation dialogs (section 9)
  error: string | null;
};
```

The translated archive is served by the existing asset route like any archive of that type.

Expose a boolean `translationEnabled` to the client through the existing client-config mechanism [VERIFY], true only when the translation env vars are set.

---

## 9. UI

Place the control next to the existing highlight toggle in the archive viewer toolbar, using the same component library and button style [VERIFY: likely shadcn/ui + lucide icons; `Languages` is a fitting icon].

States:

| State | Control |
|---|---|
| Feature disabled | Nothing rendered. |
| Not translated | Button "Translate to English". Click opens a confirmation dialog (below). |
| `pending` / `running` | Disabled button with spinner: "Warming up model…" during `warming_up`, otherwise "Translating 34/120". Small "Cancel" action. Highlight mode is disabled while the job runs [DEFAULT], so no highlight is created on a page that is about to be replaced. |
| Translated (`isApplied`) | Small non-interactive "Translated" indicator (tooltip: translation date, model). If `failedUnits > 0`, a subtle note "N passages left untranslated". |
| `failed` | "Translation failed, retry" with the error in a tooltip. The original archive is untouched. |

Confirmation dialog for "Translate to English": one or two sentences saying the archived page will be **permanently** replaced by its English translation, the original archive will be deleted, and only the link to the page is kept. If `highlightsOnArchive > 0`, add the highlight warning of section 10.

When the job finishes, the frame reloads the bookmark's archive (now English) automatically. No Original/English toggle.

Mobile app: out of scope (it will simply see the English archive as the archive).

---

## 10. Interaction with highlights

After the swap the English page **is** the archive, so the highlight mode must work on it exactly as it does on any archive, with no special-casing. Verify that nothing in the highlight feature breaks because the archive now has a different asset id.

Pre-existing highlights made on the original cannot be mapped onto the translated text, and the original is deleted. [DEFAULT]: if `highlightsOnArchive > 0`, the confirmation dialog states that N existing highlights will be deleted; they are deleted in the swap transaction (section 6.3). If the user does not confirm, nothing happens.

Highlight mode stays disabled while a translation job is running for that bookmark (section 9), so no highlight can be created on a page that is about to be replaced.

---

## 11. Configuration

Add to the zod-validated server config [VERIFY location], documented in the same place as the other env vars:

| Variable | Default | Notes |
|---|---|---|
| `TRANSLATION_BASE_URL` | unset | e.g. `http://<scirocco-tailscale-ip>:<port>/v1`. Feature disabled if unset. |
| `TRANSLATION_API_KEY` | unset | `LLAMA_SWAP_API_KEY` from scirocco. Feature disabled if unset. |
| `TRANSLATION_MODEL` | `translator` | |
| `TRANSLATION_TARGET_LANGUAGE` | `English` | Used in the prompt. |
| `TRANSLATION_TEMPERATURE` | `0.3` | |
| `TRANSLATION_MAX_CONCURRENCY` | `2` | Matches `--parallel 2` on the server. |
| `TRANSLATION_REQUEST_TIMEOUT_SEC` | `300` | |
| `TRANSLATION_BATCH_TOKEN_BUDGET` | `1500` | |
| `TRANSLATION_MAX_OUTPUT_TOKENS` | `6000` | |

These are separate from the `OPENAI_*` / `INFERENCE_*` settings, which keep serving tagging and summaries.

---

## 12. Networking

The workers container must reach scirocco's Tailscale IP. Typical setups:

- Karakeep host is on the tailnet and containers use the default bridge network: outbound traffic to `100.x.y.z` usually works through the host. MagicDNS names may not resolve inside containers, so prefer the IP.
- Otherwise a Tailscale sidecar or host networking for the workers container is needed. This is deployment, not code: document it, do not change the user's infrastructure.

Add a short section to the deployment docs with a check like:

```bash
docker compose exec workers wget -qO- http://<scirocco-ip>:<port>/health
# expected output: OK
```

---

## 13. Security

- API key only in the workers environment; never sent to the browser, never logged.
- Model output is untrusted: it only ever becomes text nodes and attribute values; placeholder parsing is strict; unknown tags make the unit invalid.
- The translated page is served with the same sandbox/CSP as the original archive; no new scripts are added to it.
- Prompt injection from page content can at most change the translated text of that page; structural validation prevents it from injecting markup.
- Limits: refuse (status `failed`, clear error) pages above a configurable number of units (e.g. 8,000) or HTML size (e.g. 50 MB) instead of running for hours.

---

## 14. Out of scope (possible v2)

- Translating SingleFile-inlined iframes (their HTML lives in `srcdoc` attributes; would need recursive parse/translate/re-escape).
- Automatic translation on archive creation, other target languages, streaming partial results into the frame.

---

## 15. Milestones

1. **Pure library** (no network): parse, segment, encode, batch, validate, reconstruct, serialize. Place it where shared server-side code lives [VERIFY]. Full unit tests.
2. **Translator client**: request building, concurrency limiter, timeouts, retries, pre-flight, output parsing. Tests against a mocked HTTP server that emulates llama-swap (cold-start delay, 5xx, 401, `finish_reason: "length"`, malformed segments).
3. **Persistence and worker**: enum + table + migration, queue, worker, asset save, swap transaction and post-commit deletion, regeneration of archive-derived data, cleanup paths.
4. **tRPC + UI**: procedures, client config flag, toolbar control, confirmation dialogs, polling, frame reload, highlight handling.
5. **Docs and manual E2E** against scirocco.

Run the repo's lint, typecheck and test commands after each milestone.

---

## 16. Tests

Library:

- Identity translator (returns each encoded unit unchanged) → serialized output is DOM-equivalent to the input. This is the most important test.
- Mock translator that reorders placeholders, or uppercases text → links keep `href`, `code` content unchanged, images untouched.
- Malformed outputs (missing placeholder, extra tag, broken nesting, missing segment id, empty) → unit left original, `failedUnits` counted, document still valid.
- Fixtures: nested inline formatting, inline `code`, `pre` blocks, tables, lists, mixed block/inline `div`s, `<br>` inside paragraphs, ruby, declarative shadow DOM templates, `translate="no"`, a real SingleFile page with large `data:` URIs and the leading SingleFile comment.
- Batching: budget respected, oversized unit split only at safe points.

Manual E2E with a real Chinese SingleFile archive:

- Cold start (model unloaded) shows "Warming up model…", then progress; at the end the frame reloads with the English page.
- Layout, images, fonts and styles identical to the original; links point to the same targets; code blocks unchanged.
- Reload the browser, open the bookmark from another device or via the API: the English page is the archive everywhere; the original asset no longer exists on disk or in the DB.
- Highlight mode works on the English page; pre-existing highlights follow the section 10 behaviour.
- Reader content and full-text search reflect the English text after the swap.
- Cancel mid-job and failed job: original archive untouched. Re-crawl during a job: translation discarded (section 6.3 step 2).
- After a translation, re-crawling the bookmark restores an original-language archive and the Translate button reappears.
- Workers restart in the middle of a job or between file write and swap → no half-swapped state, no orphan assets left after cleanup.
- Bookmark deletion removes the translated asset.

---

## 17. Acceptance criteria

- A "Translate to English" control appears next to the highlight toggle only when the feature is configured.
- One click (plus confirmation) translates the page asynchronously, with visible progress and a clear warm-up state.
- On success the English page replaces the archive: same layout, assets and links; every feature (viewer, highlights, export, APIs, search) sees it as the archive.
- After a successful swap the original archive is deleted (file and DB row); the bookmark URL is unchanged.
- Failures never produce a broken page and never touch the archive: either a valid, possibly partially translated page is swapped in, or a clear error with a retry action.
- No browser-side call to scirocco; API key confined to the workers.
- Tests from section 16 pass; lint and typecheck are clean; migration generated with the repo's tooling.

---

## 18. Open decisions (defaults already chosen, the user may override)

1. The translated page replaces the archive and the original is deleted (decided by the user). Only the bookmark URL remains as a link to the original page.
2. Pre-existing highlights are deleted after explicit confirmation.
3. Archive-derived data (reader content, search index) is regenerated from the English page; AI tags and summary are not re-run.
4. Translation is manual only; English is the only target language, but the schema supports others.
5. Failed passages stay in the original language (up to 20% of units), instead of failing the whole page.
