import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, errorText } from "../api/client";
import type { DriverProfile, SessionInfo } from "../api/types";
import { Kv } from "../components/ui";
import VehicleForm from "../components/VehicleForm";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";
import { fmtDateTime } from "../util/format";

function deviceName(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "App";
  return `${br} on ${os}`;
}

export default function ProfilePage({ active }: { active: boolean }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const install = useInstallPrompt();
  const [name, setName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [driver, setDriver] = useState<DriverProfile | null>(null);

  useEffect(() => {
    if (!active) return;
    api.sessions().then((r) => setSessions(r.sessions)).catch(() => {});
    if (user?.role === "driver") api.driver().then((r) => setDriver(r.driver)).catch(() => {});
    api.me().then((r) => setUser(r.user)).catch(() => {});
  }, [active, user?.role, setUser]);

  if (!user) return null;

  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setErr(null);
    try { const r = await api.updateMe({ fullName: name.trim(), phone: phone.trim() || null }); setUser(r.user); toast.push("Profile updated", "ok"); }
    catch (x) { setErr(x instanceof ApiError && x.code === "PHONE_TAKEN" ? "That phone number is already in use" : errorText(x)); }
    finally { setSaving(false); }
  }
  async function signOutAll() {
    try { await api.logoutAll(); } catch { /* fall through to local sign-out */ }
    await logout();
  }

  return (
    <div className="nr-scroll nr-fill"><div className="nr-page">
      <h2 className="nr-h mt-1">Profile</h2>

      <div className="nr-panel nr-panel--glow d-flex justify-content-between align-items-center">
        <div><div className="fs-4 fw-bold">{user.fullName}</div><div className="nr-mono nr-muted small">{user.email}</div></div>
        <div className="text-end"><div className="nr-big" style={{ fontSize: "1.6rem" }}>★ {user.rating.average.toFixed(2)}</div><div className="nr-label m-0">{user.rating.count} rating{user.rating.count === 1 ? "" : "s"} · {user.role}</div></div>
      </div>

      <h3 className="nr-h">Details</h3>
      <form className="nr-panel" onSubmit={save}>
        <label className="form-label" htmlFor="p-name">Full name</label>
        <input id="p-name" className="form-control mb-2" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <label className="form-label" htmlFor="p-phone">Phone</label>
        <input id="p-phone" className="form-control mb-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+639171234567" inputMode="tel" />
        {err && <div className="nr-error mb-2" role="alert">{err}</div>}
        <button className="btn-cp btn-block" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </form>

      {user.role === "driver" && (
        <>
          <h3 className="nr-h">Vehicle</h3>
          <div className="nr-panel">{driver ? <VehicleForm key={driver.vehicle.plate + driver.vehicle.type} initial={driver} onSaved={setDriver} /> : <span className="nr-muted">Loading…</span>}
            {driver?.status === "busy" && <div className="nr-muted small mt-2">Vehicle changes are blocked during an active ride.</div>}</div>
        </>
      )}

      <h3 className="nr-h">Signed-in devices</h3>
      <div className="nr-panel">
        {sessions.length === 0 ? <span className="nr-muted">…</span> : sessions.map((s) => (
          <Kv key={s.sessionId} rows={[[deviceName(s.userAgent) + (s.current ? " (this device)" : ""), fmtDateTime(s.lastUsedAt)]]} />
        ))}
      </div>

      <h3 className="nr-h">App</h3>
      <div className="nr-panel">
        {install.canInstall && <button className="btn-cp btn-block mb-2" onClick={install.prompt}>Install OPHIR</button>}
        {install.installed && <div className="nr-muted small mb-2">Installed as an app on this device.</div>}
        <Kv rows={[["Version", "1.0.0 prototype"], ["Map data", "© OpenStreetMap contributors"], ["Geocoding", "Nominatim (OSM)"]]} />
      </div>

      <div className="d-flex gap-2 pb-3">
        <button className="btn-cp-ghost flex-fill" onClick={logout}>Sign out</button>
        <button className="btn-cp-danger flex-fill" onClick={signOutAll}>Sign out everywhere</button>
      </div>
    </div></div>
  );
}
