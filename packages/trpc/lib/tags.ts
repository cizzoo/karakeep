import { and, eq, inArray } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { bookmarkTags } from "@karakeep/db/schema";

/**
 * A reference to a tag, either by its existing id or by name. Shared by every
 * resource that attaches tags from the user's single `bookmarkTags` pool
 * (currently bookmarks and todo lists).
 */
export interface TagIdentifier {
  tagId?: string;
  tagName?: string;
}

/**
 * Creates any `bookmarkTags` rows for `names` that don't already exist for
 * this user, and silently reuses (does nothing for) the ones that do. Relies
 * on the `(userId, name)` unique constraint on `bookmarkTags` so re-tagging
 * with an existing name never creates a duplicate row.
 */
export async function ensureTagsExistByName(
  db: DB,
  userId: string,
  names: string[],
): Promise<void> {
  const toCreate = names.filter((n) => n.length > 0);
  if (toCreate.length === 0) {
    return;
  }
  await db
    .insert(bookmarkTags)
    .values(toCreate.map((name) => ({ name, userId })))
    .onConflictDoNothing();
}

/**
 * Resolves a list of tag identifiers (by id and/or by name) to their
 * `{id, name}` rows, scoped to `userId`. Tags referenced only by name are
 * expected to already exist (see `ensureTagsExistByName`) - any that don't
 * are silently dropped from the result.
 */
export async function resolveTagIdentifiers(
  db: DB,
  userId: string,
  identifiers: TagIdentifier[],
): Promise<{ id: string; name: string }[]> {
  const tagIds = identifiers.flatMap((t) => (t.tagId ? [t.tagId] : []));
  const tagNames = identifiers.flatMap((t) => (t.tagName ? [t.tagName] : []));

  const [byIds, byNames] = await Promise.all([
    tagIds.length > 0
      ? db
          .select({ id: bookmarkTags.id, name: bookmarkTags.name })
          .from(bookmarkTags)
          .where(
            and(
              eq(bookmarkTags.userId, userId),
              inArray(bookmarkTags.id, tagIds),
            ),
          )
      : Promise.resolve([]),
    tagNames.length > 0
      ? db
          .select({ id: bookmarkTags.id, name: bookmarkTags.name })
          .from(bookmarkTags)
          .where(
            and(
              eq(bookmarkTags.userId, userId),
              inArray(bookmarkTags.name, tagNames),
            ),
          )
      : Promise.resolve([]),
  ]);

  // Union results and deduplicate by tag ID
  const seen = new Set<string>();
  const results: { id: string; name: string }[] = [];
  for (const tag of [...byIds, ...byNames]) {
    if (!seen.has(tag.id)) {
      seen.add(tag.id);
      results.push(tag);
    }
  }
  return results;
}
