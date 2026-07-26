import { useCallback, useEffect, useState } from "react";

/**
 * Hash routing.
 *
 * Hash rather than history API for two reasons: GitHub Pages serves this from
 * a sub-path with no server-side rewrites, and an installed PWA needs the
 * Android back button to step back through the app instead of closing it.
 * Each navigation is a real history entry, so back just works.
 */

export type View =
  | "menu"
  | "points"
  | "attendance"
  | "games"
  | "notes"
  | "notices"
  | "resources"
  | "homework"
  | "park"
  | "swipemaths"
  | "bookmarks"
  | "summary"
  | "activity"
  | "config";

export type PointsTab = "class" | "standings" | "hall";

export interface Route {
  view: View;
  /** Sub-tab within Points. */
  tab: PointsTab;
  /** Park drill-down: board -> class -> subject -> chapter. */
  board?: string;
  classLevel?: number;
  subjectId?: string;
  chapterId?: string;
}

const VIEWS = new Set<string>([
  "menu",
  "points",
  "attendance",
  "games",
  "notes",
  "notices",
  "resources",
  "homework",
  "park",
  "swipemaths",
  "bookmarks",
  "summary",
  "activity",
  "config",
]);

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const head = parts[0] ?? "menu";

  if (!VIEWS.has(head)) return { view: "menu", tab: "class" };

  if (head === "points") {
    const tab = parts[1];
    return {
      view: "points",
      tab: tab === "standings" || tab === "hall" ? tab : "class",
    };
  }

  if (head === "park") {
    const level = parts[2] ? Number(parts[2]) : undefined;
    return {
      view: "park",
      tab: "class",
      board: parts[1],
      classLevel: Number.isFinite(level) ? level : undefined,
      subjectId: parts[3],
      chapterId: parts[4],
    };
  }

  return { view: head as View, tab: "class" };
}

export function buildHash(route: Partial<Route> & { view: View }): string {
  const segments: (string | number | undefined)[] = [route.view];

  if (route.view === "points") {
    segments.push(route.tab ?? "class");
  } else if (route.view === "park") {
    segments.push(route.board, route.classLevel, route.subjectId, route.chapterId);
  }

  // Stop at the first gap so a chapter id can never be read as a subject id.
  const path: string[] = [];
  for (const segment of segments) {
    if (segment === undefined || segment === null || segment === "") break;
    path.push(encodeURIComponent(String(segment)));
  }

  return `#/${path.join("/")}`;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  /** Pushes a history entry, so the back button returns here. */
  const navigate = useCallback((next: Partial<Route> & { view: View }) => {
    const hash = buildHash(next);
    if (hash === window.location.hash) return;
    window.location.hash = hash;
  }, []);

  const back = useCallback(() => {
    // Nothing to go back to on a cold open (a shared link, say): land on the
    // menu rather than leaving the app.
    if (window.history.length > 1) window.history.back();
    else window.location.hash = "#/menu";
  }, []);

  return { route, navigate, back };
}
