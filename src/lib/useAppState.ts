import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, TrophyWinner } from "../types";
import { applyWriteOp, closeDueCycles, fetchAppState, subscribeToChanges, WriteOp } from "./db";
import { isSupabaseConfigured } from "./supabase";
import { formatDateString, readCachedState, writeCachedState } from "./storage";

export type SyncStatus =
  | "loading"
  | "synced"
  | "saving"
  | "pending" // queued writes waiting for the network
  | "offline" // showing cached data, never reached the server
  | "error";

/** Produces the next state plus the writes that reproduce it server-side. */
export type Mutator = (prev: AppState) => { next: AppState; ops: WriteOp[] } | null;

const QUEUE_KEY = "classpoints_pending_ops_v1";
const RETRY_DELAYS_MS = [1000, 3000, 8000, 20000, 60000];

const loadQueue = (): WriteOp[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistQueue = (ops: WriteOp[]) => {
  try {
    if (ops.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
  } catch {
    /* cache-only failure; the in-memory queue still drains this session */
  }
};

/**
 * Owns the scoreboard: loads it from Supabase, applies edits optimistically,
 * and drains a durable write queue so marks made on flaky classroom wifi are
 * not lost. Supabase is authoritative — the local copy is a cache that every
 * successful fetch overwrites.
 */
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [celebration, setCelebration] = useState<TrophyWinner[]>([]);

  const queueRef = useRef<WriteOp[]>([]);
  const flushingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  /** Calendar day the rollover check last ran, to keep it to once a day. */
  const lastRolloverCheckRef = useRef<string | null>(null);

  /**
   * Shadow copy of `state` that is readable synchronously. Mutations need the
   * current scoreboard *outside* a setState updater: StrictMode invokes those
   * updaters twice, which would enqueue every write to Supabase twice.
   */
  const stateRef = useRef<AppState | null>(null);

  const commit = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
    writeCachedState(next);
  }, []);

  const syncQueueCount = useCallback(() => {
    setPendingCount(queueRef.current.length);
  }, []);

  // -- queue draining ------------------------------------------------------

  // Annotated explicitly: `flush` schedules itself for retry, and a
  // self-referential useCallback infers as `any` and quietly poisons the type
  // of everything downstream of it (enqueue, mutate, the whole hook).
  const flush: () => Promise<void> = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    setStatus("saving");

    try {
      while (queueRef.current.length > 0) {
        // Peek, don't shift: a failed op must stay at the head so ordering
        // survives a retry.
        await applyWriteOp(queueRef.current[0]);
        queueRef.current = queueRef.current.slice(1);
        persistQueue(queueRef.current);
        if (mountedRef.current) syncQueueCount();
      }

      attemptRef.current = 0;
      if (mountedRef.current) {
        setError(null);
        setStatus("synced");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus(navigator.onLine ? "error" : "pending");

      const delay = RETRY_DELAYS_MS[Math.min(attemptRef.current, RETRY_DELAYS_MS.length - 1)];
      attemptRef.current += 1;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        void flush();
      }, delay);
    } finally {
      flushingRef.current = false;
    }
  }, [syncQueueCount]);

  const enqueue: (ops: WriteOp[]) => void = useCallback(
    (ops: WriteOp[]) => {
      if (ops.length === 0) return;
      queueRef.current = [...queueRef.current, ...ops];
      persistQueue(queueRef.current);
      syncQueueCount();
      void flush();
    },
    [flush, syncQueueCount]
  );

  /**
   * Applies a local change immediately and queues the matching write. The
   * updater returns the next state plus the operations that reproduce it
   * server-side.
   */
  const mutate: (updater: Mutator) => void = useCallback(
    (updater: Mutator) => {
      const prev = stateRef.current;
      if (!prev) return;
      const result = updater(prev);
      if (!result) return;
      commit(result.next);
      enqueue(result.ops);
    },
    [commit, enqueue]
  );

  // -- loading -------------------------------------------------------------

  const load: (opts?: { background?: boolean }) => Promise<void> = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      // Never let a server read overwrite edits that have not been sent yet.
      if (queueRef.current.length > 0) return;
      if (!background) setStatus("loading");

      try {
        // Ask the database to close out any period that ended while nobody had
        // the app open. Idempotent, but not free — realtime echoes call load()
        // constantly during marking, so only check once per calendar day (and
        // on any foreground load). The hourly cron job covers a board that is
        // left open across a rollover without ever reloading.
        const today = formatDateString(new Date());
        let closed: TrophyWinner[] = [];
        if (!background || lastRolloverCheckRef.current !== today) {
          lastRolloverCheckRef.current = today;
          closed = await closeDueCycles();
          if (!mountedRef.current) return;
        }

        const fresh = await fetchAppState();
        if (!mountedRef.current) return;
        commit(fresh);
        setError(null);
        setStatus("synced");

        if (closed.length > 0) setCelebration(closed);
      } catch (err) {
        if (!mountedRef.current) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);

        // Fall back to the cache so the board is still readable, but say so.
        const cached = readCachedState();
        if (cached && !background) {
          commit(cached);
          setStatus("offline");
        } else if (!background) {
          setStatus("error");
        }
      }
    },
    [commit, enqueue]
  );

  // -- wiring --------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    queueRef.current = loadQueue();
    syncQueueCount();

    if (!isSupabaseConfigured) {
      setStatus("error");
      setError(
        new Error(
          "Supabase is not configured. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are read when the app is built — set them in .env.local and restart the dev server, or in the repository's Actions variables and re-run the deploy."
        )
      );
      return () => {
        mountedRef.current = false;
      };
    }

    void load();
    if (queueRef.current.length > 0) void flush();

    // Our own writes echo back as realtime events too, so a burst of Quick Mark
    // taps would otherwise trigger a refetch per tap. Coalesce them.
    let refetchTimer: number | null = null;
    const unsubscribe = subscribeToChanges(() => {
      if (refetchTimer) window.clearTimeout(refetchTimer);
      refetchTimer = window.setTimeout(() => {
        refetchTimer = null;
        void load({ background: true });
      }, 400);
    });

    // The refresh bug: a resumed tab used to keep rendering whatever it had
    // in memory. Re-read on every return to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void flush();
        void load({ background: true });
      }
    };
    const onOnline = () => {
      void flush();
      void load({ background: true });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onVisible);

    return () => {
      mountedRef.current = false;
      if (refetchTimer) window.clearTimeout(refetchTimer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onVisible);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
  }, [load, flush, syncQueueCount]);

  const retry = useCallback(() => {
    attemptRef.current = 0;
    void flush();
    void load();
  }, [flush, load]);

  /** Replaces the whole scoreboard (backup restore / local-data upload). */
  const replaceAll = useCallback(
    (next: AppState) => {
      commit(next);
      enqueue([{ kind: "replaceAll", state: next }]);
    },
    [commit, enqueue]
  );

  return {
    state,
    status,
    error,
    pendingCount,
    celebration,
    dismissCelebration: () => setCelebration([]),
    celebrate: setCelebration,
    mutate,
    replaceAll,
    refresh: () => load({ background: true }),
    retry,
  };
}
