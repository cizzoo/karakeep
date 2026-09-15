"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

// There's no existing "search my bookmarks and pick one" control anywhere in
// the app to reuse here (the closest analog, `BookmarkListSelector`, picks a
// *list*, not a bookmark) and `bookmarks.getBookmarks` has no server-side
// title/url text filter outside of the optional meilisearch-backed
// `searchBookmarks` endpoint. So this fetches a bounded page of the user's
// most recent bookmarks and filters client-side - intentionally the
// smallest reasonable version of this control, not a full search UI.
//
// Generic on purpose: it doesn't know about todo lists or todo items, just
// "pick a bookmark, excluding these ids" - both `LinkedBookmarksSection`
// (list-scoped) and `LinkedBookmarksSectionForItem` (item-scoped) reuse it
// as-is.
const CANDIDATE_POOL_SIZE = 100;

export function BookmarkPicker({
  excludeBookmarkIds,
  onSelect,
  disabled,
}: {
  excludeBookmarkIds: string[];
  onSelect: (bookmarkId: string) => void;
  disabled?: boolean;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);

  const { data, isPending } = useQuery(
    api.bookmarks.getBookmarks.queryOptions(
      { limit: CANDIDATE_POOL_SIZE, sortOrder: "desc" },
      { enabled: open },
    ),
  );

  const excludeSet = new Set(excludeBookmarkIds);
  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const candidates = (data?.bookmarks ?? []).filter((bookmark) => {
    if (excludeSet.has(bookmark.id)) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    const title = (getBookmarkTitle(bookmark) ?? "").toLowerCase();
    const url =
      bookmark.content.type === BookmarkTypes.LINK
        ? bookmark.content.url.toLowerCase()
        : "";
    return title.includes(normalizedSearch) || url.includes(normalizedSearch);
  });

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          setOpen(nextOpen);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Plus className="mr-2 size-4" />
          {t("todos.link_bookmark")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-80 p-0"
        align="end"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t("todos.search_bookmarks_placeholder")}
          />
          <CommandList>
            {isPending ? (
              <div className="flex justify-center p-4">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <CommandEmpty>{t("todos.no_bookmarks_found")}</CommandEmpty>
                <CommandGroup className="max-h-72 overflow-y-auto">
                  {candidates.map((bookmark) => (
                    <CommandItem
                      key={bookmark.id}
                      value={bookmark.id}
                      keywords={[getBookmarkTitle(bookmark) ?? ""]}
                      className="cursor-pointer"
                      onSelect={() => {
                        onSelect(bookmark.id);
                        setSearch("");
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">
                        {getBookmarkTitle(bookmark) ??
                          t("todos.untitled_bookmark")}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
