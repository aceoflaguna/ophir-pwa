import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText, type ListedRide } from "../api/client";
import type { Ride, RideEvent, RideStatus } from "../api/types";
import MapView from "../components/MapView";
import { placeLabel } from "../components/PlaceField";
import { Kv, Modal, Star, Stars, StatusBadge } from "../components/ui";
import { useToast } from "../state/toast";
import { dayLabel, duration, EVENT_LABEL, fmtDateTime, fmtTime, money } from "../util/format";

type Filter = "all" | "completed" | "cancelled" | "no_drivers";
const FILTERS: [Filter, string][] = [["all", "All"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["no_drivers", "No drivers"]];
const PAGE = 15;

interface Stats { completed: number; cancelled: number; noDrivers: number; totalFare: number; totalEarnings: number; totalKm: number; currency: string }

export default function HistoryPage({ role, active }: { role: "rider" | "driver"; active: boolean }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [rides, setRides] = useState<ListedRide[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const seq = useRef(0);

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    try {
      const r = await api.rides({ status: filter === "all" ? undefined : (filter as RideStatus), limit: PAGE, offset });
      if (mine !== seq.current) return;
      setRides((cur) => (replace ? r.rides : [...cur, ...r.rides]));
      setHasMore(r.rides.length === PAGE);
    } catch (e) { if (mine === seq.current) setError(errorText(e)); }
    finally { if (mine === seq.current) setLoading(false); }
  }, [filter]);

  // (re)load whenever the tab becomes visible or the filter changes
  useEffect(() => {
    if (!active) return;
    void fetchPage(0, true);
    api.rideStats().then(setStats).catch(() => {});
  }, [active, fetchPage]);

  // group by calendar day
  const groups: { label: string; items: ListedRide[] }[] = [];
  for (const r of rides) {
    const label = dayLabel(r.timestamps.requestedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(r); else groups.push({ label, items: [r] });
  }

  const money$ = (n: number) => money(n, stats?.currency);
  return (
    <div className="nr-scroll nr-fill"><div className="nr-page">
      <h2 className="nr-h mt-1">{role === "driver" ? "Trip history" : "Ride history"}</h2>

      <div className="nr-stats">
        <div className="nr-stat"><div className="v">{stats?.completed ?? "–"}</div><div className="l">Trips</div></div>
        <div className="nr-stat"><div className="v">{stats ? money$(role === "driver" ? stats.totalEarnings : stats.totalFare) : "–"}</div><div className="l">{role === "driver" ? "Earned" : "Spent"}</div></div>
        <div className="nr-stat"><div className="v">{stats ? stats.totalKm.toFixed(1) : "–"}</div><div className="l">Kilometres</div></div>
        <div className="nr-stat"><div className="v">{stats ? stats.cancelled + stats.noDrivers : "–"}</div><div className="l">Cancelled</div></div>
      </div>

      <div className="nr-chips" role="tablist" aria-label="Filter trips">
        {FILTERS.map(([k, label]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label}</button>)}
      </div>

      {error && <div className="nr-panel"><span className="nr-error">{error}</span> <button className="btn-cp-ghost btn-sm-cp ms-2" onClick={() => fetchPage(0, true)}>Retry</button></div>}
      {!error && !loading && rides.length === 0 && <div className="nr-empty">{filter === "all" ? (role === "driver" ? "No trips yet. Go online and accept your first ride." : "No rides yet. Book your first trip from the Ride tab.") : "Nothing matches this filter."}</div>}

      {groups.map((g) => (
        <section key={g.label}>
          <div className="nr-day">{g.label}</div>
          {g.items.map((r) => <TripRow key={r.id} ride={r} role={role} onOpen={() => setOpenId(r.id)} />)}
        </section>
      ))}

      {loading && <div className="nr-muted text-center py-3 nr-mono">loading…</div>}
      {hasMore && !loading && <button className="btn-cp-ghost btn-block mt-2" onClick={() => fetchPage(rides.length, false)}>Load more</button>}

      {openId && <RideDetail id={openId} role={role} onClose={() => setOpenId(null)} onRated={(id, n) => {
        setRides((l) => l.map((x) => (x.id === id ? { ...x, ratings: { ...x.ratings, ...(role === "rider" ? { driverRating: n } : { riderRating: n }) } } : x)));
        toast.push("Rating sent", "ok");
      }} />}
    </div></div>
  );
}

function TripRow({ ride, role, onOpen }: { ride: ListedRide; role: "rider" | "driver"; onOpen: () => void }) {
  const cp = ride.counterpart;
  const who = role === "driver" ? cp?.name : cp?.name ? `${cp.name}${cp.vehicle ? ` · ${cp.vehicle.plate}` : ""}` : null;
  const received = role === "driver" ? ride.ratings.driverRating : ride.ratings.riderRating;
  const amount = ride.status === "completed" ? (role === "driver" ? ride.final?.driverEarnings : ride.final?.fare) : null;
  return (
    <button className={`nr-trip ${ride.status}`} onClick={onOpen} aria-label={`Trip on ${fmtDateTime(ride.timestamps.requestedAt)}, ${ride.status}`}>
      <div className="d-flex justify-content-between align-items-center">
        <span className="nr-mono nr-muted small">{fmtTime(ride.timestamps.requestedAt)} · {ride.vehicleType}</span>
        <StatusBadge status={ride.status} />
      </div>
      <div className="route"><i /><span>{placeLabel(ride.pickup)}</span><i className="b" /><span>{placeLabel(ride.dropoff)}</span></div>
      <div className="d-flex justify-content-between align-items-end mt-2">
        <span className="small nr-muted">{who ?? (ride.status === "completed" ? "" : "—")}{ride.status === "completed" && received != null && <> {who && "· "}<Star n={received} /></>}</span>
        {amount != null ? <span className="amt">{money(amount, ride.currency)}</span> : <span className="nr-muted nr-mono small">{money(ride.estimate.fare, ride.currency)} est.</span>}
      </div>
    </button>
  );
}

function RideDetail({ id, role, onClose, onRated }: { id: string; role: "rider" | "driver"; onClose: () => void; onRated: (id: string, n: number) => void }) {
  const toast = useToast();
  const [ride, setRide] = useState<Ride | null>(null);
  const [events, setEvents] = useState<RideEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let off = false;
    Promise.all([api.ride(id), api.rideEvents(id)])
      .then(([r, e]) => { if (!off) { setRide(r.ride); setEvents(e.events); } })
      .catch((x) => { if (!off) setErr(errorText(x)); });
    return () => { off = true; };
  }, [id]);

  const mine = role === "rider" ? ride?.ratings.driverRating : ride?.ratings.riderRating;      // rating I gave
  const theirs = role === "rider" ? ride?.ratings.riderRating : ride?.ratings.driverRating;    // rating I received
  const canRate = ride?.status === "completed" && mine == null && !sent;

  async function rate() {
    if (!rating) return;
    try { await api.rateRide(id, rating); setSent(true); onRated(id, rating); }
    catch (x) { toast.push(errorText(x), "bad"); }
  }

  const t = ride?.timestamps;
  return (
    <Modal title="Trip receipt" onClose={onClose}>
      {err && <div className="nr-error">{err}</div>}
      {!ride && !err && <div className="nr-muted nr-mono">loading…</div>}
      {ride && t && (
        <>
          <div className="nr-miniMap"><MapView pickup={ride.pickup} dropoff={ride.dropoff} fitKey={ride.id} interactive={false} /></div>
          <div className="d-flex justify-content-between align-items-center mb-2"><span className="nr-mono nr-muted small">{fmtDateTime(t.requestedAt)}</span><StatusBadge status={ride.status} /></div>

          <div className="nr-panel">
            <Kv rows={[
              ["From", placeLabel(ride.pickup)],
              ["To", placeLabel(ride.dropoff)],
              [role === "rider" ? "Driver" : "Rider", role === "rider" ? (ride.driver ? `${ride.driver.name} · ${ride.driver.vehicle.color} ${ride.driver.vehicle.make} ${ride.driver.vehicle.model} · ${ride.driver.vehicle.plate}` : "—") : (ride.rider?.name ?? "—")],
              ["Class", ride.vehicleType],
              ["Distance", `${ride.final?.distanceKm ?? ride.estimate.distanceKm} km`],
              ["Duration", t.startedAt && t.completedAt ? duration(t.startedAt, t.completedAt) : "—"],
            ]} />
          </div>

          <div className="nr-panel nr-panel--glow">
            <Kv rows={role === "rider" ? [
              ["Quote", money(ride.estimate.fare, ride.currency)],
              ["Total paid", <b className="nr-yellow">{money(ride.final?.fare, ride.currency)}</b>],
              ["Payment", ride.paymentMethod],
            ] : [
              ["Fare", money(ride.final?.fare ?? ride.estimate.fare, ride.currency)],
              ["Platform fee", money(ride.final?.platformFee, ride.currency)],
              ["Your earnings", <b className="nr-yellow">{money(ride.final?.driverEarnings, ride.currency)}</b>],
              ["Payment", ride.paymentMethod],
            ]} />
          </div>

          {ride.cancellation && <div className="nr-panel"><span className="nr-label">Cancelled</span>By {ride.cancellation.by}{ride.cancellation.reason ? ` · ${ride.cancellation.reason}` : ""}</div>}

          {ride.status === "completed" && (
            <div className="nr-panel">
              <Kv rows={[["Rating you received", <Star n={theirs} />], ["Rating you gave", <Star n={sent ? rating : mine} />]]} />
              {canRate && <div className="mt-3"><Stars value={rating} onChange={setRating} /><button className="btn-cp-ghost btn-block mt-2" disabled={!rating} onClick={rate}>Rate {role === "rider" ? "driver" : "rider"}</button></div>}
            </div>
          )}

          <h3 className="nr-h mt-3">Timeline</h3>
          <ul className="nr-timeline">
            {events.map((e) => (
              <li key={e.id}>{EVENT_LABEL[e.type] ?? e.type}<time>{fmtDateTime(e.createdAt)}</time></li>
            ))}
          </ul>
          <div className="nr-mono nr-muted small mt-2">ID {ride.id}</div>
        </>
      )}
    </Modal>
  );
}
