// OpenStreetMap Nominatim (open source geocoder). Public instance: light, user-driven use only (debounced, no autocomplete spam).
const BASE = "https://nominatim.openstreetmap.org";
export interface GeoHit { lat: number; lng: number; label: string }

const short = (name: string) => name.split(",").slice(0, 3).map((s) => s.trim()).join(", ");

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<GeoHit[]> {
  const res = await fetch(`${BASE}/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error("Search unavailable");
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return rows.map((r) => ({ lat: +r.lat, lng: +r.lon, label: short(r.display_name) }));
}

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`, { signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { display_name?: string };
    return j.display_name ? short(j.display_name) : null;
  } catch { return null; }
}
