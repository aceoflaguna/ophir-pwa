import type { RideStatus } from "../api/types";

export const money = (n: number | null | undefined, cur = "USD") =>
  n == null ? "—" : cur === "USD" ? `$${n.toFixed(2)}` : `${n.toFixed(2)} ${cur}`;

export const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtDateTime = (d: string | Date) => `${fmtDate(d)} · ${fmtTime(d)}`;

export function dayLabel(d: string | Date) {
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((+today - +day) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: day.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function duration(from: string | number | Date, to: string | number | Date) {
  const s = Math.max(0, Math.round((+new Date(to) - +new Date(from)) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);

export const STATUS_LABEL: Record<RideStatus, string> = {
  searching: "Searching", accepted: "Driver en route", arrived: "Driver arrived", in_progress: "In progress",
  completed: "Completed", cancelled: "Cancelled", no_drivers: "No drivers",
};
export const STATUS_TONE: Record<RideStatus, string> = {
  searching: "warn", accepted: "info", arrived: "info", in_progress: "info", completed: "ok", cancelled: "off", no_drivers: "bad",
};
export const isLive = (s: RideStatus) => s === "searching" || s === "accepted" || s === "arrived" || s === "in_progress";

export const EVENT_LABEL: Record<string, string> = {
  requested: "Ride requested", offered: "Offered to a driver", offer_expired: "Offer expired", accepted: "Driver accepted",
  arrived: "Driver arrived at pickup", started: "Trip started", completed: "Trip completed", cancelled: "Ride cancelled",
  driver_cancelled: "Driver cancelled, re-matching", no_drivers: "No drivers found", rated: "Rating submitted",
};
