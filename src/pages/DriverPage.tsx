import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errorText } from "../api/client";
import type { DriverProfile, Earnings, Offer, Ride } from "../api/types";
import MapView, { DEFAULT_CENTER, type LatLng } from "../components/MapView";
import { Kv, Sheet, StatusBadge } from "../components/ui";
import VehicleForm from "../components/VehicleForm";
import { useGeolocation } from "../hooks/useGeolocation";
import { usePolling } from "../hooks/usePolling";
import { useToast } from "../state/toast";
import { haversineKm, km, money } from "../util/format";
import RideChat from "../components/RideChat";

const load = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export default function DriverPage({ active }: { active: boolean }) {
  const toast = useToast();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"gps" | "manual">(() => load("neon.locmode", "gps"));
  const [manual, setManual] = useState<LatLng>(() => load("neon.manualloc", DEFAULT_CENTER));
  const geo = useGeolocation(mode === "gps");
  const loc = mode === "gps" ? geo.pos : manual;
  const locRef = useRef(loc); locRef.current = loc;
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ride, setRide] = useState<Ride | null>(null);
  const [done, setDone] = useState<Ride | null>(null);
  const [today, setToday] = useState<Earnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const status = profile?.status ?? "offline";
  const statusRef = useRef(status); statusRef.current = status;

  const refreshEarnings = useCallback(() => { api.earnings({ from: startOfToday() }).then(setToday).catch(() => {}); }, []);
  const refreshProfile = useCallback(async () => {
    try { const d = await api.driver(); setProfile(d.driver); setNeedsProfile(false); }
    catch (e) { if (e instanceof ApiError && e.status === 403) setNeedsProfile(true); }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { void refreshProfile(); refreshEarnings(); }, [refreshProfile, refreshEarnings]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  /* heartbeat: the server drops drivers that go silent for 2 minutes */
  usePolling(async () => {
    const l = locRef.current;
    if (!l) return;
    try { await api.sendLocation(l.lat, l.lng); }
    catch (e) { if (e instanceof ApiError && e.status === 409) void refreshProfile(); }
  }, 4000, status !== "offline");

  /* offers + active ride */
  usePolling(async () => {
    const { ride: r } = await api.activeRide();
    setRide(r);
    if (r) {
      setOffers([]);
      if (statusRef.current !== "busy") setProfile((p) => (p ? { ...p, status: "busy" } : p));
    } else {
      if (statusRef.current === "busy") { await refreshProfile(); refreshEarnings(); }
      const o = await api.offers();
      setOffers(o.offers);
    }
  }, 1500, status !== "offline");

  /* ---------- actions ---------- */
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.push(errorText(e), "bad"); } finally { setBusy(false); }
  };
  const toggleOnline = () => guard(async () => {
    if (status === "offline") {
      if (!loc) throw new Error(geo.error ?? "Waiting for a GPS fix…");
      await api.goOnline(loc.lat, loc.lng);
      setProfile((p) => (p ? { ...p, status: "online" } : p));
      toast.push("You are online", "ok");
    } else {
      await api.goOffline();
      setProfile((p) => (p ? { ...p, status: "offline" } : p)); setOffers([]);
    }
  });
  const accept = (o: Offer) => guard(async () => {
    const r = await api.acceptOffer(o.offerId);
    setRide(r.ride); setOffers([]); setProfile((p) => (p ? { ...p, status: "busy" } : p)); setDone(null);
  });
  const decline = (o: Offer) => guard(async () => { await api.declineOffer(o.offerId); setOffers((l) => l.filter((x) => x.offerId !== o.offerId)); });
  const step = (op: "arrive" | "start" | "complete") => guard(async () => {
    if (!ride) return;
    const r = await api[op](ride.id);
    if (op === "complete") { setDone(r.ride); setRide(null); await refreshProfile(); refreshEarnings(); toast.push(`Trip complete: you earned ${money(r.ride.final?.driverEarnings, r.ride.currency)}`, "ok"); }
    else setRide((cur) => ({ ...(cur ?? r.ride), ...r.ride, rider: cur?.rider }));
  });
  const cancelRide = () => guard(async () => { if (ride) { await api.cancelRide(ride.id, "Cancelled by driver"); setRide(null); await refreshProfile(); } });

  const moveManual = (p: LatLng) => {
    setManual(p); save("neon.manualloc", p);
    if (statusRef.current !== "offline") void api.sendLocation(p.lat, p.lng).catch(() => {});
  };
  const setLocMode = (m: "gps" | "manual") => { setMode(m); save("neon.locmode", m); };

  /* ---------- render ---------- */
  const topOffer = offers[0];
  const focus = ride ?? topOffer?.ride ?? null;
  const toPickup = ride && loc ? haversineKm(loc, ride.pickup) : null;
  const toDrop = ride && loc ? haversineKm(loc, ride.dropoff) : null;
  const fitKey = `${ride?.id ?? topOffer?.offerId ?? "idle"}:${ride?.status ?? ""}:${status}:${loc ? 1 : 0}`;

  if (loaded && needsProfile) {
    return (
      <div className="nr-scroll nr-fill"><div className="nr-page">
        <h2 className="nr-h mt-2">Register your vehicle</h2>
        <div className="nr-panel nr-panel--glow"><p className="nr-muted">One last step before you can go online.</p><VehicleForm onSaved={(d) => { setProfile(d); setNeedsProfile(false); }} submitLabel="Save and continue" /></div>
      </div></div>
    );
  }

  return (
    <div className="nr-fill nr-has-side">
      <MapView
        pickup={focus?.pickup} dropoff={focus?.dropoff} me={loc} fitKey={fitKey}
        onTap={mode === "manual" ? moveManual : undefined}
      >
        {active && mode === "manual" && <div className="nr-map-hint"><span>Manual GPS: tap map to move your car</span></div>}
      </MapView>

      <Sheet>
        <div className="nr-peek d-flex justify-content-between align-items-center mb-2">
          <div><h2 className="nr-h m-0">Driver console</h2><span className={`nr-chip ${status !== "offline" ? "nr-chip--on" : ""}`}><i className={`nr-dot ${status !== "offline" ? "nr-dot--ok" : ""}`} />{status}</span></div>
          <button className={status === "offline" ? "btn-cp" : "btn-cp-ghost"} disabled={busy || status === "busy" || !loaded} onClick={toggleOnline}>{status === "offline" ? "Go online" : "Go offline"}</button>
        </div>

        {/* location source */}
        <div className="nr-panel">
          <span className="nr-label">Location source</span>
          <div className="nr-seg mb-2"><button className={mode === "gps" ? "on" : ""} onClick={() => setLocMode("gps")}>Device GPS</button><button className={mode === "manual" ? "on" : ""} onClick={() => setLocMode("manual")}>Manual (tap map)</button></div>
          <div className="nr-mono small">{loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : geo.error ?? "Acquiring GPS fix…"}</div>
          {mode === "gps" && geo.error && <div className="nr-error mt-1">{geo.error}. Switch to manual to simulate a position.</div>}
          {mode === "manual" && ride && (
            <div className="d-flex gap-2 mt-2">
              <button className="btn-cp-ghost btn-sm-cp flex-fill" onClick={() => moveManual({ lat: ride.pickup.lat, lng: ride.pickup.lng })}>Jump to pickup</button>
              <button className="btn-cp-ghost btn-sm-cp flex-fill" onClick={() => moveManual({ lat: ride.dropoff.lat, lng: ride.dropoff.lng })}>Jump to drop-off</button>
            </div>
          )}
        </div>

        {/* today */}
        <div className="nr-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="nr-stat"><div className="v">{today?.trips ?? 0}</div><div className="l">Trips today</div></div>
          <div className="nr-stat"><div className="v">{money(today?.net ?? 0, today?.currency)}</div><div className="l">Earned today</div></div>
          <div className="nr-stat"><div className="v">{money(profile?.totalEarnings ?? 0)}</div><div className="l">Lifetime</div></div>
        </div>

        {/* active ride */}
        {ride && (
          <div className="nr-panel nr-panel--glow">
            <div className="d-flex justify-content-between align-items-center mb-2"><h3 className="nr-h m-0">Active trip</h3><StatusBadge status={ride.status} /></div>
            <Kv rows={[
              ["Rider", ride.rider ? `${ride.rider.name} · ★ ${ride.rider.rating.toFixed(1)}` : "…"],
              ["Pickup", ride.pickup.address ?? `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`],
              ["Drop-off", ride.dropoff.address ?? `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`],
              ["Fare", money(ride.estimate.fare, ride.currency) + ` · ${ride.paymentMethod}`],
              [ride.status === "in_progress" ? "To drop-off" : "To pickup", (ride.status === "in_progress" ? toDrop : toPickup) != null ? km((ride.status === "in_progress" ? toDrop : toPickup)!) : "—"],
            ]} />

            <div className="mt-3"><RideChat key={ride.id} rideId={ride.id} me="driver" peerName={ride.rider?.name} /></div>
            <div className="d-flex gap-2 mt-3 flex-wrap">
              {ride.status === "accepted" && <button className="btn-cp flex-fill" disabled={busy} onClick={() => step("arrive")}>I have arrived</button>}
              {ride.status === "arrived" && <button className="btn-cp flex-fill" disabled={busy} onClick={() => step("start")}>Start trip</button>}
              {ride.status === "in_progress" && <button className="btn-cp flex-fill" disabled={busy} onClick={() => step("complete")}>Complete trip</button>}
              {(ride.status === "accepted" || ride.status === "arrived") && <button className="btn-cp-danger" disabled={busy} onClick={cancelRide}>Cancel</button>}
            </div>
          </div>
        )}

        {/* just finished */}
        {done && !ride && (
          <div className="nr-panel nr-panel--glow text-center">
            <span className="nr-label">Trip complete</span>
            <div className="nr-big">{money(done.final?.driverEarnings, done.currency)}</div>
            <div className="nr-muted small mb-2">your earnings · fare {money(done.final?.fare, done.currency)} · fee {money(done.final?.platformFee, done.currency)}</div>
            <button className="btn-cp-ghost btn-sm-cp" onClick={() => setDone(null)}>Dismiss</button>
          </div>
        )}

        {/* offers */}
        {!ride && status === "online" && (
          offers.length === 0
            ? <div className="nr-empty"><div className="nr-radar" style={{ border: 0 }}><span>listening for rides</span></div></div>
            : offers.map((o) => {
                const left = Math.max(0, Math.round((new Date(o.expiresAt).getTime() - now) / 1000));
                return (
                  <div className="nr-panel nr-panel--glow" key={o.offerId}>
                    <div className="d-flex justify-content-between align-items-center mb-2"><h3 className="nr-h m-0">Incoming ride</h3><span className="nr-chip nr-chip--on">{left}s</span></div>
                    <Kv rows={[
                      ["Pickup", `${km(o.distanceToPickupKm)} away`],
                      ["Trip", `${o.ride.estimate.distanceKm} km · ${o.ride.estimate.durationMin} min`],
                      ["Fare", `${money(o.ride.estimate.fare, o.ride.currency)} · ${o.ride.paymentMethod}`],
                      ["Class", o.ride.vehicleType],
                    ]} />
                    <div className="d-flex gap-2 mt-3"><button className="btn-cp flex-fill" disabled={busy || left === 0} onClick={() => accept(o)}>Accept</button><button className="btn-cp-ghost" disabled={busy} onClick={() => decline(o)}>Decline</button></div>
                  </div>
                );
              })
        )}
        {status === "offline" && !ride && <div className="nr-empty">You are offline. Go online to receive ride requests.</div>}
      </Sheet>
    </div>
  );
}
