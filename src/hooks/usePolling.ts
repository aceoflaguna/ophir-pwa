import { useEffect, useRef } from "react";

/** Calls `fn` now and then every `ms` after each run finishes (no overlap). Errors are swallowed; handle them inside `fn`. */
export function usePolling(fn: () => Promise<unknown> | unknown, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      try { await ref.current(); } catch { /* handled by caller */ }
      if (!stopped) timer = window.setTimeout(tick, ms);
    };
    void tick();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [ms, enabled]);
}
