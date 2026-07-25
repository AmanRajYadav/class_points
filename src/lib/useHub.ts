import { useCallback, useEffect, useState } from "react";
import { Board, Chapter, Resource, Subject } from "../types";
import {
  addBookmark,
  fetchBookmarks,
  fetchKindCounts,
  fetchTree,
  HubSchemaMissingError,
  removeBookmark,
} from "./hub";

/**
 * Hub-wide data that many screens share: the Park tree, per-kind counts for
 * the menu badges, and the current device's bookmark set.
 *
 * Individual lists fetch their own rows — this only holds what would otherwise
 * be refetched on every navigation.
 */
export function useHub(studentId: string | null) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  /** True when 02_hub.sql has not been run yet, so the UI can say so plainly. */
  const [schemaMissing, setSchemaMissing] = useState(false);

  const loadTree = useCallback(async () => {
    try {
      const tree = await fetchTree();
      setBoards(tree.boards);
      setSubjects(tree.subjects);
      setChapters(tree.chapters);
      setSchemaMissing(false);
    } catch (e) {
      if (e instanceof HubSchemaMissingError) setSchemaMissing(true);
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      setCounts(await fetchKindCounts());
    } catch {
      /* the badges are decorative; a failure here should not surface */
    }
  }, []);

  useEffect(() => {
    void loadTree();
    void loadCounts();
  }, [loadTree, loadCounts]);

  useEffect(() => {
    if (!studentId) {
      setBookmarkedIds(new Set());
      return;
    }
    let active = true;
    fetchBookmarks(studentId)
      .then((rows) => active && setBookmarkedIds(new Set(rows.map((b) => b.resourceId))))
      .catch(() => active && setBookmarkedIds(new Set()));
    return () => {
      active = false;
    };
  }, [studentId]);

  /** Optimistic: the star flips instantly and reverts only if the write fails. */
  const toggleBookmark = useCallback(
    async (resource: Resource) => {
      if (!studentId) return;
      const isSaved = bookmarkedIds.has(resource.id);

      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(resource.id);
        else next.add(resource.id);
        return next;
      });

      try {
        if (isSaved) await removeBookmark(studentId, resource.id);
        else await addBookmark(studentId, resource.id);
      } catch {
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          if (isSaved) next.add(resource.id);
          else next.delete(resource.id);
          return next;
        });
      }
    },
    [studentId, bookmarkedIds]
  );

  return {
    boards,
    subjects,
    chapters,
    counts,
    bookmarkedIds,
    schemaMissing,
    toggleBookmark,
    refreshTree: loadTree,
    refreshCounts: loadCounts,
  };
}
