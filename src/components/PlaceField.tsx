import { useEffect, useRef, useState } from "react";
import { searchPlaces, type GeoHit } from "../api/geocode";
import type { Place } from "../api/types";

const COORDS = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
export const placeLabel = (p: Place | null | undefined) => (p ? p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : "");

interface Props {
  tag: "A" | "B";
  value: Place | null;
  placeholder: string;
  active: boolean;
  onActivate: () => void;
  onPick: (p: Place) => void;
  extra?: React.ReactNode;
}

/** Address search (OpenStreetMap Nominatim) that also accepts raw "lat, lng". Map taps update `value` from outside. */
export default function PlaceField({ tag, value, placeholder, active, onActivate, onPick, extra }: Props) {
  const [text, setText] = useState(placeLabel(value));
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const typing = useRef(false);

  useEffect(() => { if (!typing.current) setText(placeLabel(value)); }, [value]);

  useEffect(() => {
    if (!typing.current) return;
    const q = text.trim();
    if (q.length < 3 || COORDS.test(q)) { setHits([]); setMsg(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await searchPlaces(q, ctl.signal);
        setHits(r); setMsg(r.length ? null : "No results");
      } catch (e) { if ((e as Error).name !== "AbortError") { setHits([]); setMsg("Search unavailable. Tap the map or type lat, lng."); } }
    }, 600);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text]);

  const choose = (p: Place) => { typing.current = false; setHits([]); setMsg(null); setText(placeLabel(p)); onPick(p); };
  const submit = () => {
    const m = COORDS.exec(text);
    if (m) {
      const lat = +m[1]!, lng = +m[2]!;
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) choose({ lat, lng, address: null });
      else setMsg("Latitude must be -90..90, longitude -180..180");
    } else if (hits[0]) choose({ lat: hits[0].lat, lng: hits[0].lng, address: hits[0].label });
  };

  return (
    <>
      <div className={`nr-place ${active ? "active" : ""}`}>
        <div className={`tag ${tag === "A" ? "a" : "b"}`}><span>{tag}</span></div>
        <input
          className="form-control" value={text} placeholder={placeholder} aria-label={placeholder} inputMode="search" autoComplete="off" enterKeyHint="search"
          onFocus={(e) => { onActivate(); e.currentTarget.select(); }}
          onChange={(e) => { typing.current = true; setText(e.target.value); }}
          onBlur={() => setTimeout(() => { typing.current = false; }, 150)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
        {extra}
      </div>
      {(hits.length > 0 || msg) && (
        <div className="nr-results" role="listbox">
          {hits.map((h, i) => <button key={i} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => choose({ lat: h.lat, lng: h.lng, address: h.label })}>{h.label}</button>)}
          {msg && <div className="nr-muted p-2 small">{msg}</div>}
        </div>
      )}
    </>
  );
}
