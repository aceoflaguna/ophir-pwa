import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "../components/MapView";

export interface GeoState { pos: LatLng | null; error: string | null; accuracy: number | null }

/** Live device position while `enabled`. `once()` gets a single fix (used for "use my location"). */
export function useGeolocation(enabled: boolean): GeoState {
  const [state, setState] = useState<GeoState>({ pos: null, error: null, accuracy: null });
  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) { setState((s) => ({ ...s, error: "Geolocation is not supported on this device" })); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ pos: { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }, error: null, accuracy: p.coords.accuracy }),
      (e) => setState((s) => ({ ...s, error: e.code === 1 ? "Location permission denied" : "Location unavailable" })),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return state;
}

export function useCurrentPosition() {
  return useCallback(
    () => new Promise<LatLng>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation is not supported on this device"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
        (e) => reject(new Error(e.code === 1 ? "Location permission denied" : "Location unavailable")),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }),
    [],
  );
}
