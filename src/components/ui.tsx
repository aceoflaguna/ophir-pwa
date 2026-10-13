import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RideStatus } from "../api/types";
import { STATUS_LABEL, STATUS_TONE } from "../util/format";

export const StatusBadge = ({ status }: { status: RideStatus }) => <span className={`nr-status nr-status--${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;

export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="m-0">{rows.map(([k, v]) => <div className="nr-kv" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

/** Bottom sheet on phones (collapsible via the handle), side panel on desktop. Anything inside `.nr-peek` stays visible when collapsed. */
export function Sheet({ children }: { children: ReactNode }) {
  const [peek, setPeek] = useState(false);
  return (
    <div className={`nr-sheet ${peek ? "is-peek" : ""}`}>
      <button className="nr-sheet-handle" onClick={() => setPeek((p) => !p)} aria-label={peek ? "Expand panel" : "Collapse panel"} aria-expanded={!peek}><i /></button>
      <div className="nr-sheet-body">{children}</div>
    </div>
  );
}

export function Stars({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="nr-stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={n <= value ? "on" : ""} disabled={disabled} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

export const Star = ({ n }: { n: number | null | undefined }) => (n == null ? <span className="nr-muted">—</span> : <span className="nr-yellow">★ {n.toFixed(n % 1 ? 1 : 0)}</span>);

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose; // callers pass inline closures; keep the effect mount-only so focus isn't stolen on re-render
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="nr-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="nr-modal" ref={ref}>
        <header><h2 className="nr-h m-0">{title}</h2><button className="nr-icon-btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}

const svg = (d: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="square">{d}</svg>;
export const Icons = {
  ride: svg(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  drive: svg(<><path d="M3 15l2-6h14l2 6v4h-3v-2H6v2H3z" /><circle cx="7.5" cy="14.5" r="1" /><circle cx="16.5" cy="14.5" r="1" /></>),
  history: svg(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 7v5l3 2" /></>),
  profile: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>),
};
