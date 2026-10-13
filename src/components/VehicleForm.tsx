import { useState, type FormEvent } from "react";
import { api, ApiError, errorText } from "../api/client";
import type { DriverProfile, VehicleType } from "../api/types";
import { useToast } from "../state/toast";

export default function VehicleForm({ initial, onSaved, submitLabel = "Save vehicle" }: { initial?: DriverProfile | null; onSaved: (d: DriverProfile) => void; submitLabel?: string }) {
  const toast = useToast();
  const [f, setF] = useState({
    licenseNumber: initial?.licenseNumber ?? "", vehicleMake: initial?.vehicle.make ?? "", vehicleModel: initial?.vehicle.model ?? "",
    vehicleColor: initial?.vehicle.color ?? "", plateNumber: initial?.vehicle.plate ?? "", vehicleType: (initial?.vehicle.type ?? "economy") as VehicleType,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api.saveDriver(f); toast.push("Vehicle saved", "ok"); onSaved(r.driver); }
    catch (x) { setErr(x instanceof ApiError && x.code === "PLATE_TAKEN" ? "That plate is already registered" : errorText(x)); }
    finally { setBusy(false); }
  }

  const field = (k: keyof typeof f, label: string, ph: string) => (
    <div className="col-6"><label className="form-label" htmlFor={`v-${k}`}>{label}</label>
      <input id={`v-${k}`} className="form-control" value={f[k]} onChange={set(k)} placeholder={ph} required minLength={k === "licenseNumber" ? 4 : 1} /></div>
  );
  return (
    <form onSubmit={submit} className="row g-2">
      {field("vehicleMake", "Make", "Toyota")}{field("vehicleModel", "Model", "Vios")}
      {field("vehicleColor", "Color", "Black")}{field("plateNumber", "Plate", "ABC 1234")}
      <div className="col-6"><label className="form-label" htmlFor="v-lic">License no.</label>
        <input id="v-lic" className="form-control" value={f.licenseNumber} onChange={set("licenseNumber")} placeholder="N01-23-456789" required minLength={4} /></div>
      <div className="col-6"><label className="form-label" htmlFor="v-type">Class</label>
        <select id="v-type" className="form-select" value={f.vehicleType} onChange={set("vehicleType")}><option value="economy">Economy</option><option value="comfort">Comfort</option><option value="xl">XL</option></select></div>
      {err && <div className="col-12 nr-error" role="alert">{err}</div>}
      <div className="col-12"><button className="btn-cp btn-block" disabled={busy}>{busy ? "Saving…" : submitLabel}</button></div>
    </form>
  );
}
