"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type {
  AvailableTag,
  DashboardDocument,
  SearchResult,
} from "@/lib/document-management/list";
import type { DocumentListActionPort } from "@/lib/action-ports";

import { deleteDocument, restoreDocument, searchDocuments } from "./actions";
import { DocumentGrid, EmptyDocumentList } from "./document-grid";
import { DocumentListToolbar } from "./document-list-toolbar";
import { UndoToast } from "./document-list-undo-toast";
import {
  applyDocumentListViewState,
  filterDocumentsByTag,
  filterDocumentsByView,
  parseTag,
  parseSort,
  parseView,
  replaceDocumentListQueryState,
  type SortKey,
  type ViewKey,
} from "./document-list-url-state";
import {
  isCurrentDocumentListRequest,
  nextDocumentListRequestSeq,
} from "./document-list-async-ordering";
import { useOptimisticDocumentTrash } from "./use-optimistic-document-trash";

const SEARCH_DEBOUNCE_MS = 300;
const documentListActions: Pick<
  DocumentListActionPort,
  "deleteDocument" | "restoreDocument" | "searchDocuments"
> = {
  deleteDocument,
  restoreDocument,
  searchDocuments,
};

/**
 * Renders the dashboard document list. Server data stays capped by the
 * document-management list service; this component owns only client view state,
 * debounced search, and optimistic trash/undo UX.
 */
export function DocumentList({
  documents,
  availableTags,
  listCapped = false,
}: {
  documents: DashboardDocument[];
  availableTags: AvailableTag[];
  listCapped?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    DashboardDocument[] | null
  >(null);
  const [searchCapped, setSearchCapped] = useState(false);
  const [isSearchPending, startSearchTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestSeqRef = useRef(0);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const sort = parseSort(searchParams.get("sort"));
  const view = parseView(searchParams.get("view"));
  const viewFavorites = view === "favorites";
  const selectedTag = parseTag(searchParams.get("tag"), availableTags);
  const selectedTagName =
    availableTags.find((tag) => tag.slug === selectedTag)?.name ?? null;

  const updateParams = (mutate: (params: URLSearchParams) => void) => {
    replaceDocumentListQueryState(pathname, searchParams, mutate);
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    if (!nextQuery.trim()) {
      searchRequestSeqRef.current = nextDocumentListRequestSeq(
        searchRequestSeqRef.current,
      );
      setSearchResults(null);
      setSearchCapped(false);
    }
  };

  const setSort = (next: SortKey) => {
    updateParams((params) => {
      if (next === "edited") {
        params.delete("sort");
      } else {
        params.set("sort", next);
      }
    });
  };

  const setView = (next: ViewKey) => {
    updateParams((params) => {
      if (next === "all") {
        params.delete("view");
      } else {
        params.set("view", next);
      }
    });
  };

  const setTag = (next: string | null) => {
    updateParams((params) => {
      if (!next) {
        params.delete("tag");
      } else {
        params.set("tag", next);
      }
    });
  };

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    const trimmed = query.trim();
    const requestSeq = nextDocumentListRequestSeq(searchRequestSeqRef.current);
    searchRequestSeqRef.current = requestSeq;
    if (!trimmed) {
      searchDebounceRef.current = null;
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const { results, hasMore } =
          await documentListActions.searchDocuments(trimmed);
        if (
          !isCurrentDocumentListRequest(searchRequestSeqRef.current, requestSeq)
        ) {
          return;
        }
        setSearchCapped(hasMore);
        setSearchResults(
          results.map((result: SearchResult) => ({
            id: result.id,
            title: result.title,
            favorite: result.favorite,
            editedLabel: result.editedLabel,
            workspaceName: result.workspaceName,
            thumbnail: result.thumbnail,
            excerpt: result.excerpt,
            readingMinutes: result.readingMinutes,
            createdAtMs: result.createdAtMs,
            updatedAtMs: result.updatedAtMs,
            canEdit: result.canEdit,
            canManage: result.canManage,
            tags: result.tags,
          })),
        );
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [query]);

  const {
    combinedDocuments,
    removedIds,
    undo,
    errorMessage: trashErrorMessage,
    handleDelete,
    handleUndo,
  } = useOptimisticDocumentTrash(documents, documentListActions);

  const trimmedQuery = query.trim();
  const activePool: DashboardDocument[] = trimmedQuery
    ? (searchResults ?? []).filter((document) => !removedIds.has(document.id))
    : combinedDocuments;

  const visible = applyDocumentListViewState(activePool, {
    sort,
    view,
    tagSlug: selectedTag,
  });
  const tagFiltered = filterDocumentsByTag(activePool, selectedTag);
  const favFiltered = filterDocumentsByView(tagFiltered, view);

  const hasDocuments = combinedDocuments.length > 0;
  const noTagMatch = selectedTag !== null && tagFiltered.length === 0;
  const noFavorites = viewFavorites && favFiltered.length === 0;
  const isSearching = isSearchPending && Boolean(trimmedQuery);
  const capActive = trimmedQuery ? searchCapped : listCapped;
  const showCapNotice = capActive && visible.length > 0;

  return (
    <>
      {!hasDocuments ? (
        <EmptyDocumentList />
      ) : (
        <div className="flex flex-col gap-6">
          <DocumentListToolbar
            availableTags={availableTags}
            query={query}
            setQuery={handleQueryChange}
            isSearching={isSearching}
            selectedTag={selectedTag}
            setTag={setTag}
            sort={sort}
            setSort={setSort}
            view={view}
            setView={setView}
          />

          {showCapNotice && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-4 py-2 text-sm text-ds-text-secondary"
            >
              Showing the first {visible.length} documents — narrow your search
              to see more.
            </p>
          )}
          {trashErrorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-ds-danger-border bg-ds-danger-surface px-4 py-2 text-sm text-ds-danger-text"
            >
              {trashErrorMessage}
            </p>
          )}

          <DocumentGrid
            visible={visible}
            noTagMatch={noTagMatch}
            selectedTagName={selectedTagName}
            clearTag={() => setTag(null)}
            noFavorites={noFavorites}
            onDelete={handleDelete}
          />
        </div>
      )}

      {undo && <UndoToast title={undo.title} onUndo={handleUndo} />}
    </>
  );
}
