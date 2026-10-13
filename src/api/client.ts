import type {
  Counterpart, DriverProfile, Earnings, EstimateOption, Offer, PaymentMethod, Payment, Place, Ride, RideEvent,
  RideStatus, SessionInfo, Tokens, User, VehicleType,
} from "./types";

const BASE = "/api/v1";
const KEY = "neon.tokens.v1";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

/* ---------------------------------------------------------------- token store */
function load(): Tokens | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
let tokens: Tokens | null = load();
const listeners = new Set<(t: Tokens | null) => void>();

export const getTokens = () => tokens;
export function setTokens(t: Tokens | null) {
  tokens = t;
  try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY); } catch { /* private mode */ }
  listeners.forEach((l) => l(t));
}
export function onTokens(fn: (t: Tokens | null) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

// Other tabs of the same app: keep in sync (a rotated refresh token in one tab must not be reused by another).
window.addEventListener("storage", (e) => {
  if (e.key === KEY) { tokens = load(); listeners.forEach((l) => l(tokens)); }
});

/* -------------------------------------------------------------------- fetching */
let refreshing: Promise<boolean> | null = null;

/** Run `fn` while holding a cross-tab lock (Web Locks API); falls back to running directly. */
function withTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  return locks ? locks.request("neon.refresh", fn) : fn();
}

/**
 * Refresh tokens are single-use. With several tabs open, two tabs must never spend the same one
 * (the server would treat that as reuse and revoke the session), so refreshing is serialised across
 * tabs and the stored tokens are re-read once the lock is held: if another tab already rotated them,
 * we just adopt the new pair.
 */
function refresh(staleAccess?: string): Promise<boolean> {
  refreshing ??= withTabLock(async () => {
    tokens = load();
    const current = tokens;
    if (!current) return false;
    if (staleAccess && current.accessToken !== staleAccess) return true; // another tab already refreshed
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: current.refreshToken }) });
      if (res.status === 401) { if (load()?.refreshToken === current.refreshToken) setTokens(null); return false; }
      if (!res.ok) return false;
      setTokens((await res.json()).tokens as Tokens);
      return true;
    } catch { return false; }
  }).finally(() => { refreshing = null; });
  return refreshing;
}

async function send(method: string, path: string, body: unknown, auth: boolean): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
  try {
    return await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection.");
  }
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  let res = await send(method, path, body, auth);
  if (res.status === 401 && auth && tokens) {
    const sentWith = tokens.accessToken;
    const code = (await res.clone().json().catch(() => null))?.error?.code;
    if (code === "TOKEN_EXPIRED" && (await refresh(sentWith))) res = await send(method, path, body, auth);
    else if (code === "SESSION_REVOKED" || code === "INVALID_TOKEN") setTokens(null);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? "ERROR", e.message ?? `Request failed (${res.status})`, e.details);
  }
  return json as T;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

export type ListedRide = Ride & { counterpart?: Counterpart | null };

/* ------------------------------------------------------------------------- API */
export const api = {
  register: (b: { email: string; password: string; fullName: string; phone?: string; role: "rider" | "driver" }) =>
    request<{ user: User; tokens: Tokens }>("POST", "/auth/register", b, false),
  login: (b: { email: string; password: string }) => request<{ user: User; tokens: Tokens }>("POST", "/auth/login", b, false),
  logout: () => request<void>("POST", "/auth/logout"),
  logoutAll: () => request<{ revokedSessions: number }>("POST", "/auth/logout-all"),
  sessions: () => request<{ sessions: SessionInfo[] }>("GET", "/auth/sessions"),
  me: () => request<{ user: User }>("GET", "/users/me"),
  updateMe: (b: { fullName?: string; phone?: string | null }) => request<{ user: User }>("PATCH", "/users/me", b),

  estimate: (pickup: Place, dropoff: Place) =>
    request<{ options: EstimateOption[] }>("POST", "/rides/estimate", { pickup: { lat: pickup.lat, lng: pickup.lng }, dropoff: { lat: dropoff.lat, lng: dropoff.lng } }),
  requestRide: (b: { pickup: Place; dropoff: Place; vehicleType: VehicleType; paymentMethod: PaymentMethod }) =>
    request<{ ride: Ride }>("POST", "/rides", b),
  activeRide: () => request<{ ride: Ride | null }>("GET", "/rides/active"),
  ride: (id: string) => request<{ ride: Ride }>("GET", `/rides/${id}`),
  rideStats: () => request<{ completed: number; cancelled: number; noDrivers: number; totalFare: number; totalEarnings: number; totalKm: number; currency: string }>("GET", "/rides/stats"),
  rideEvents: (id: string) => request<{ events: RideEvent[] }>("GET", `/rides/${id}/events`),
  rides: (o: { status?: RideStatus; limit?: number; offset?: number }) => request<{ rides: ListedRide[]; limit: number; offset: number }>("GET", `/rides${qs(o)}`),
  cancelRide: (id: string, reason?: string) => request<{ ride: Ride }>("POST", `/rides/${id}/cancel`, { reason }),
  rateRide: (id: string, rating: number, comment?: string) => request<void>("POST", `/rides/${id}/rate`, { rating, comment }),
  payments: () => request<{ payments: Payment[] }>("GET", "/payments"),

  driver: () => request<{ driver: DriverProfile }>("GET", "/drivers/me"),
  saveDriver: (b: { licenseNumber: string; vehicleMake: string; vehicleModel: string; vehicleColor: string; plateNumber: string; vehicleType: VehicleType }) =>
    request<{ driver: DriverProfile }>("PUT", "/drivers/me/profile", b),
  goOnline: (lat: number, lng: number) => request<{ status: string }>("POST", "/drivers/me/online", { lat, lng }),
  goOffline: () => request<{ status: string }>("POST", "/drivers/me/offline"),
  sendLocation: (lat: number, lng: number) => request<void>("PUT", "/drivers/me/location", { lat, lng }),
  offers: () => request<{ offers: Offer[] }>("GET", "/drivers/me/offers"),
  acceptOffer: (id: string) => request<{ ride: Ride }>("POST", `/drivers/me/offers/${id}/accept`),
  declineOffer: (id: string) => request<void>("POST", `/drivers/me/offers/${id}/decline`),
  arrive: (id: string) => request<{ ride: Ride }>("POST", `/rides/${id}/arrive`),
  start: (id: string) => request<{ ride: Ride }>("POST", `/rides/${id}/start`),
  complete: (id: string) => request<{ ride: Ride }>("POST", `/rides/${id}/complete`, {}),
  earnings: (o: { from?: string; to?: string } = {}) => request<Earnings>("GET", `/drivers/me/earnings${qs(o)}`),
};

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");
