import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errorText } from "../api/client";
import { reverseGeocode } from "../api/geocode";
import type { EstimateOption, PaymentMethod, Place, Ride, VehicleType } from "../api/types";
import MapView from "../components/MapView";
import PlaceField from "../components/PlaceField";
import { Kv, Sheet, Stars, StatusBadge } from "../components/ui";
import { useCurrentPosition } from "../hooks/useGeolocation";
import { usePolling } from "../hooks/usePolling";
import { useToast } from "../state/toast";
import { duration, haversineKm, isLive, km, money } from "../util/format";

const VEHICLE_NAME: Record<VehicleType, string> = { economy: "Economy", comfort: "Comfort", xl: "XL" };

export default function RiderPage({ active }: { active: boolean }) {
  const toast = useToast();
  const getPos = useCurrentPosition();
  const [ride, setRide] = useState<Ride | null>(null);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [target, setTarget] = useState<"pickup" | "dropoff">("pickup");
  const [options, setOptions] = useState<EstimateOption[] | null>(null);
  const [veh, setVeh] = useState<VehicleType>("economy");
  const [pay, setPay] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [tick, setTick] = useState(0);
  const live = !!ride && isLive(ride.status);

  /* ---------- load current ride + initial location ---------- */
  useEffect(() => {
    api.activeRide().then((r) => { if (r.ride) setRide(r.ride); }).catch(() => {});
    getPos().then((p) => { setPickup((cur) => cur ?? { ...p, address: null }); setTarget("dropoff"); }).catch(() => {});
  }, [getPos]);

  const fillAddress = useCallback(async (which: "pickup" | "dropoff", p: Place) => {
    const address = await reverseGeocode(p.lat, p.lng);
    if (!address) return;
    const patch = (cur: Place | null) => (cur && cur.lat === p.lat && cur.lng === p.lng ? { ...cur, address } : cur);
    which === "pickup" ? setPickup(patch) : setDropoff(patch);
  }, []);

  const setPlace = useCallback((which: "pickup" | "dropoff", p: Place) => {
    which === "pickup" ? setPickup(p) : setDropoff(p);
    if (!p.address) void fillAddress(which, p);
    if (which === "pickup") setTarget("dropoff");
  }, [fillAddress]);

  /* ---------- live ride polling ---------- */
  usePolling(async () => {
    if (!ride) return;
    try {
      const r = await api.ride(ride.id);
      setRide((cur) => (cur && cur.id === r.ride.id ? r.ride : cur));
    } catch (e) { if (e instanceof ApiError && e.status === 404) setRide(null); }
  }, 2000, live);

  // keep a moving driver in frame: refit every 15 s while a trip is live
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, [live]);

  /* ---------- estimate (fare, ETA, drivers nearby) ---------- */
  useEffect(() => {
    if (ride || !pickup || !dropoff) { setOptions(null); return; }
    let cancelled = false;
    const run = async () => {
      try { const r = await api.estimate(pickup, dropoff); if (!cancelled) setOptions(r.options); }
      catch (e) { if (!cancelled) { setOptions(null); if (!(e instanceof ApiError && e.status === 0)) toast.push(errorText(e), "bad"); } }
    };
    const t = setTimeout(run, 350);
    const iv = setInterval(run, 15000);
    return () => { cancelled = true; clearTimeout(t); clearInterval(iv); };
  }, [ride, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- actions ---------- */
  async function locate() {
    try { const p = await getPos(); setPlace("pickup", { ...p, address: null }); }
    catch (e) { toast.push(errorText(e), "bad"); }
  }
  async function request() {
    if (!pickup || !dropoff) return;
    setBusy(true);
    try {
      const r = await api.requestRide({ pickup, dropoff, vehicleType: veh, paymentMethod: pay });
      setRide(r.ride); setRated(false); setRating(0); setConfirmCancel(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "ACTIVE_RIDE_EXISTS") { const a = await api.activeRide().catch(() => null); if (a?.ride) setRide(a.ride); toast.push("You already have an active ride", "info"); }
      else toast.push(errorText(e), "bad");
    } finally { setBusy(false); }
  }
  async function cancel() {
    if (!ride) return;
    setBusy(true);
    try { const r = await api.cancelRide(ride.id, "Cancelled by rider"); setRide(r.ride); setConfirmCancel(false); }
    catch (e) { toast.push(errorText(e), "bad"); }
    finally { setBusy(false); }
  }
  async function submitRating() {
    if (!ride || !rating) return;
    try { await api.rateRide(ride.id, rating); setRated(true); toast.push("Thanks, rating sent", "ok"); }
    catch (e) { if (e instanceof ApiError && e.code === "ALREADY_RATED") setRated(true); else toast.push(errorText(e), "bad"); }
  }
  const reset = () => { setRide(null); setDropoff(null); setOptions(null); setTarget("dropoff"); setRating(0); setRated(false); };

  /* ---------- map data ---------- */
  const shown = ride ?? { pickup, dropoff };
  const vehiclePos = ride?.driver?.location && live && ride.status !== "searching" ? ride.driver.location : null;
  const fitKey = `${ride?.id ?? "new"}:${ride?.status ?? ""}:${pickup?.lat},${pickup?.lng}:${dropoff?.lat},${dropoff?.lng}:${live ? tick : 0}`;
  const tapRef = useRef(target); tapRef.current = target;

  return (
    <div className="nr-fill nr-has-side">
      <MapView
        pickup={shown.pickup} dropoff={shown.dropoff} vehicle={vehiclePos} fitKey={fitKey}
        onTap={ride ? undefined : (p) => setPlace(tapRef.current, { ...p, address: null })}
      >
        {!ride && active && <div className="nr-map-hint"><span>Tap map → set {target === "pickup" ? "pickup (A)" : "drop-off (B)"}</span></div>}
        {!ride && <div className="nr-map-tools"><button className="nr-icon-btn" onClick={locate} aria-label="Use my location" title="Use my location">◎</button></div>}
      </MapView>

      <Sheet>
        {!ride && (
          <Compose
            pickup={pickup} dropoff={dropoff} target={target} setTarget={setTarget} setPlace={setPlace} locate={locate}
            options={options} veh={veh} setVeh={setVeh} pay={pay} setPay={setPay} busy={busy} onRequest={request}
          />
        )}
        {ride && ride.status === "searching" && <Searching ride={ride} confirm={confirmCancel} setConfirm={setConfirmCancel} onCancel={cancel} busy={busy} />}
        {ride && ["accepted", "arrived", "in_progress"].includes(ride.status) && <Trip ride={ride} confirm={confirmCancel} setConfirm={setConfirmCancel} onCancel={cancel} busy={busy} />}
        {ride && ride.status === "completed" && <Receipt ride={ride} rating={rating} setRating={setRating} rated={rated || ride.ratings.driverRating != null} onRate={submitRating} onDone={reset} />}
        {ride && (ride.status === "cancelled" || ride.status === "no_drivers") && (
          <>
            <div className="nr-peek"><h2 className="nr-h">{ride.status === "no_drivers" ? "No drivers available" : "Ride cancelled"}</h2></div>
            <div className="nr-panel"><p className="m-0 nr-muted">{ride.status === "no_drivers" ? "Nobody was close enough this time. Try again in a moment, or pick another class." : `Cancelled by ${ride.cancellation?.by ?? "system"}${ride.cancellation?.reason ? `: ${ride.cancellation.reason}` : ""}.`}</p></div>
            <button className="btn-cp btn-block" onClick={reset}>Book again</button>
          </>
        )}
      </Sheet>
    </div>
  );
}

/* =================================================================== compose */
function Compose(p: {
  pickup: Place | null; dropoff: Place | null; target: "pickup" | "dropoff"; setTarget: (t: "pickup" | "dropoff") => void;
  setPlace: (w: "pickup" | "dropoff", pl: Place) => void; locate: () => void; options: EstimateOption[] | null;
  veh: VehicleType; setVeh: (v: VehicleType) => void; pay: PaymentMethod; setPay: (m: PaymentMethod) => void; busy: boolean; onRequest: () => void;
}) {
  const sel = p.options?.find((o) => o.vehicleType === p.veh);
  const tooClose = p.pickup && p.dropoff && haversineKm(p.pickup, p.dropoff) < 0.12;
  return (
    <>
      <div className="nr-peek"><h2 className="nr-h">Where to?</h2></div>
      <PlaceField
        tag="A" value={p.pickup} placeholder="Pickup: search, tap map or lat, lng" active={p.target === "pickup"} onActivate={() => p.setTarget("pickup")}
        onPick={(pl) => p.setPlace("pickup", pl)}
        extra={<button type="button" className="nr-icon-btn" style={{ width: 44, height: 44 }} onClick={p.locate} aria-label="Use my location">◎</button>}
      />
      <PlaceField tag="B" value={p.dropoff} placeholder="Drop-off: search, tap map or lat, lng" active={p.target === "dropoff"} onActivate={() => p.setTarget("dropoff")} onPick={(pl) => p.setPlace("dropoff", pl)} />

      {p.pickup && p.dropoff && !tooClose ? (
        <>
          <span className="nr-label mt-3">Choose class</span>
          {!p.options && <div className="nr-muted small mb-2">Scanning fares…</div>}
          {p.options?.map((o) => (
            <button key={o.vehicleType} className={`nr-veh ${p.veh === o.vehicleType ? "on" : ""}`} onClick={() => p.setVeh(o.vehicleType)} aria-pressed={p.veh === o.vehicleType}>
              <div><strong>{VEHICLE_NAME[o.vehicleType]}</strong>
                <div className="nr-muted small">{o.nearbyDrivers > 0 ? `${o.nearbyDrivers} nearby · pickup ~${o.pickupEtaMin} min` : "No drivers nearby"} · {o.durationMin} min trip</div></div>
              <span className="fare">{money(o.fare, o.currency)}</span>
            </button>
          ))}
          <div className="row g-2 mt-1 mb-2">
            <div className="col-5"><label className="form-label" htmlFor="pay">Payment</label>
              <select id="pay" className="form-select" value={p.pay} onChange={(e) => p.setPay(e.target.value as PaymentMethod)}><option value="cash">Cash</option><option value="card">Card</option><option value="wallet">Wallet</option></select></div>
            <div className="col-7 d-flex align-items-end"><button className="btn-cp btn-block" disabled={p.busy || !p.options} onClick={p.onRequest}>{p.busy ? "Requesting…" : `Request ${VEHICLE_NAME[p.veh]}${sel ? ` · ${money(sel.fare, sel.currency)}` : ""}`}</button></div>
          </div>
          {sel && sel.nearbyDrivers === 0 && <div className="nr-muted small">No drivers in range right now. We will keep searching for a few minutes if you request.</div>}
        </>
      ) : (
        <div className="nr-muted small mt-2">{tooClose ? "Pickup and drop-off are too close together." : "Set both points to see fares. Tap the map to place the active marker."}</div>
      )}
    </>
  );
}

/* ================================================================== searching */
function Searching({ ride, confirm, setConfirm, onCancel, busy }: { ride: Ride; confirm: boolean; setConfirm: (b: boolean) => void; onCancel: () => void; busy: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return (
    <>
      <div className="nr-peek"><h2 className="nr-h">Finding your driver</h2></div>
      <div className="nr-radar"><span>scanning · {duration(ride.timestamps.requestedAt, now)}</span></div>
      <div className="nr-panel"><Kv rows={[["Class", VEHICLE_NAME[ride.vehicleType]], ["Quote", money(ride.estimate.fare, ride.currency)], ["Trip", `${ride.estimate.distanceKm} km · ${ride.estimate.durationMin} min`], ["Payment", ride.paymentMethod]]} /></div>
      <CancelRow confirm={confirm} setConfirm={setConfirm} onCancel={onCancel} busy={busy} />
    </>
  );
}

function CancelRow({ confirm, setConfirm, onCancel, busy }: { confirm: boolean; setConfirm: (b: boolean) => void; onCancel: () => void; busy: boolean }) {
  return confirm ? (
    <div className="d-flex gap-2"><button className="btn-cp-danger flex-fill" disabled={busy} onClick={onCancel}>Confirm cancel</button><button className="btn-cp-ghost flex-fill" onClick={() => setConfirm(false)}>Keep ride</button></div>
  ) : (
    <button className="btn-cp-danger btn-block" onClick={() => setConfirm(true)}>Cancel ride</button>
  );
}

/* ====================================================================== trip */
function Trip({ ride, confirm, setConfirm, onCancel, busy }: { ride: Ride; confirm: boolean; setConfirm: (b: boolean) => void; onCancel: () => void; busy: boolean }) {
  const d = ride.driver;
  const away = d?.location ? haversineKm(d.location, ride.status === "in_progress" ? ride.dropoff : ride.pickup) : null;
  const eta = away != null ? Math.max(1, Math.round((away * 1.3) / 30 * 60)) : null;
  const headline = { accepted: "Driver on the way", arrived: "Your driver has arrived", in_progress: "Trip in progress" }[ride.status as "accepted" | "arrived" | "in_progress"];
  return (
    <>
      <div className="nr-peek d-flex justify-content-between align-items-center"><h2 className="nr-h m-0">{headline}</h2><StatusBadge status={ride.status} /></div>
      {away != null && ride.status !== "arrived" && (
        <div className="nr-panel nr-panel--glow d-flex justify-content-between align-items-end">
          <div><span className="nr-label">{ride.status === "in_progress" ? "To drop-off" : "Pickup in"}</span><div className="nr-big">~{eta} min</div></div>
          <div className="text-end nr-mono nr-muted">{km(away)}</div>
        </div>
      )}
      {d && (
        <div className="nr-panel">
          <div className="d-flex justify-content-between align-items-start">
            <div><div className="fs-5 fw-bold">{d.name}</div><div className="nr-muted">{d.vehicle.color} {d.vehicle.make} {d.vehicle.model}</div></div>
            <div className="text-end"><div className="nr-yellow nr-mono">★ {d.rating.toFixed(2)}</div><div className="nr-mono border border-warning px-2 mt-1">{d.vehicle.plate}</div></div>
          </div>
          {d.phone && <a className="btn-cp-ghost btn-sm-cp btn-block mt-2 text-decoration-none" href={`tel:${d.phone}`}>Call driver</a>}
        </div>
      )}
      <div className="nr-panel"><Kv rows={[["Quote", money(ride.estimate.fare, ride.currency)], ["Payment", ride.paymentMethod]]} /></div>
      {ride.status !== "in_progress" && <CancelRow confirm={confirm} setConfirm={setConfirm} onCancel={onCancel} busy={busy} />}
    </>
  );
}

/* ================================================================== receipt */
function Receipt({ ride, rating, setRating, rated, onRate, onDone }: { ride: Ride; rating: number; setRating: (n: number) => void; rated: boolean; onRate: () => void; onDone: () => void }) {
  const t = ride.timestamps;
  return (
    <>
      <div className="nr-peek"><h2 className="nr-h">Arrived. Trip complete</h2></div>
      <div className="nr-panel nr-panel--glow text-center"><span className="nr-label">Total fare</span><div className="nr-big">{money(ride.final?.fare, ride.currency)}</div><div className="nr-muted small mt-1">paid by {ride.paymentMethod}</div></div>
      <div className="nr-panel">
        <Kv rows={[
          ["Distance", `${ride.final?.distanceKm ?? ride.estimate.distanceKm} km`],
          ["Duration", t.startedAt && t.completedAt ? duration(t.startedAt, t.completedAt) : "—"],
          ["Quote", money(ride.estimate.fare, ride.currency)],
          ...(ride.driver ? [["Driver", `${ride.driver.name} · ${ride.driver.vehicle.plate}`] as [string, string]] : []),
        ]} />
      </div>
      {rated ? <div className="nr-muted text-center mb-3">Rating sent. Thank you.</div> : (
        <div className="mb-3"><span className="nr-label text-center">Rate your driver</span><Stars value={rating} onChange={setRating} />
          <button className="btn-cp-ghost btn-block mt-2" disabled={!rating} onClick={onRate}>Send rating</button></div>
      )}
      <button className="btn-cp btn-block" onClick={onDone}>Done</button>
    </>
  );
}
