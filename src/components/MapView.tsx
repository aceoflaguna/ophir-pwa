import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, type ReactNode } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";

export interface LatLng { lat: number; lng: number }
export const DEFAULT_CENTER: LatLng = { lat: 14.5547, lng: 121.0244 };

const pin = (cls: string, glyph: string, size = 36) =>
  L.divIcon({ className: "nr-pin-wrap", html: `<div class="nr-pin ${cls}"><span>${glyph}</span></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const ICONS = {
  pickup: pin("nr-pin--pickup", "A"),
  dropoff: pin("nr-pin--drop", "B"),
  vehicle: pin("nr-pin--car", "◈", 38),
  me: L.divIcon({ className: "nr-pin-wrap", html: '<div class="nr-me"><i></i></div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
};

interface Props {
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  vehicle?: LatLng | null;
  me?: LatLng | null;
  /** Re-fit the viewport to the visible points only when this key changes (so live movement does not fight the user's panning). */
  fitKey: string;
  onTap?: (p: LatLng) => void;
  radiusKm?: number | null;
  interactive?: boolean;
  children?: ReactNode;
}

function Controller({ points, fitKey, onTap }: { points: LatLng[]; fitKey: string; onTap?: (p: LatLng) => void }) {
  const map = useMap();
  const pts = useRef(points); pts.current = points;
  const tap = useRef(onTap); tap.current = onTap;

  useMapEvents({ click: (e) => tap.current?.({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }) });

  // hidden tabs / resized sheets: keep Leaflet's size in sync
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    const p = pts.current;
    if (!p.length) return;
    // On phones the bottom sheet covers the lower part of the map: pad for it.
    const mobile = window.innerWidth < 992;
    const bottom = mobile ? Math.round(window.innerHeight * 0.42) : 40;
    if (p.length === 1) {
      const z = Math.max(map.getZoom(), 15);
      const target = map.project([p[0]!.lat, p[0]!.lng], z).add([0, mobile ? bottom / 2 - 30 : 0]);
      map.setView(map.unproject(target, z), z, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(p.map((x) => [x.lat, x.lng] as [number, number])), { paddingTopLeft: [40, 70], paddingBottomRight: [40, bottom], maxZoom: 16, animate: true });
    }
  }, [fitKey, map]);
  return null;
}

export default function MapView({ pickup, dropoff, vehicle, me, fitKey, onTap, radiusKm, interactive = true, children }: Props) {
  const points = [pickup, dropoff, vehicle, me].filter((p): p is LatLng => !!p);
  const start = points[0] ?? DEFAULT_CENTER;
  return (
    <div className="nr-map">
      <MapContainer
        center={[start.lat, start.lng]} zoom={14} zoomControl={false} attributionControl
        dragging={interactive} scrollWheelZoom={interactive} doubleClickZoom={interactive} touchZoom={interactive} boxZoom={interactive} keyboard={interactive}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          className="nr-tiles" maxZoom={19}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {pickup && dropoff && <Polyline positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]} pathOptions={{ color: "#fcee0a", weight: 3, dashArray: "2 10", opacity: 0.9 }} />}
        {pickup && radiusKm ? <Circle center={[pickup.lat, pickup.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#fcee0a", weight: 1, opacity: 0.35, fillOpacity: 0.03, dashArray: "4 8", interactive: false }} /> : null}
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={ICONS.pickup} zIndexOffset={400} />}
        {dropoff && <Marker position={[dropoff.lat, dropoff.lng]} icon={ICONS.dropoff} zIndexOffset={300} />}
        {vehicle && <Marker position={[vehicle.lat, vehicle.lng]} icon={ICONS.vehicle} zIndexOffset={800} />}
        {me && <Marker position={[me.lat, me.lng]} icon={ICONS.me} zIndexOffset={900} />}
        <Controller points={points} fitKey={fitKey} onTap={onTap} />
      </MapContainer>
      {children}
    </div>
  );
}
