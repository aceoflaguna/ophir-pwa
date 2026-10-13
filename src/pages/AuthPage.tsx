import { useState, type FormEvent } from "react";
import { ApiError, errorText } from "../api/client";
import { useAuth } from "../state/auth";

type Details = { path: string; message: string }[];

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<"rider" | "driver">("rider");
  const [f, setF] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setFieldErr({});
    try {
      if (mode === "login") await login(f.email.trim(), f.password);
      else await register({ email: f.email.trim(), password: f.password, fullName: f.fullName.trim(), phone: f.phone.trim() || undefined, role });
    } catch (x) {
      if (x instanceof ApiError && Array.isArray(x.details)) {
        const m: Record<string, string> = {};
        for (const d of x.details as Details) m[d.path] ??= d.message;
        setFieldErr(m);
      }
      setErr(x instanceof ApiError && x.code === "INVALID_CREDENTIALS" ? "Wrong email or password" : x instanceof ApiError && x.code === "EMAIL_TAKEN" ? "That email is already registered" : errorText(x));
    } finally { setBusy(false); }
  }

  const fe = (k: string) => (fieldErr[k] ? <div className="nr-error mt-1">{fieldErr[k]}</div> : null);
  return (
    <div className="nr-auth">
      <div className="nr-auth-card">
        <div className="nr-logo nr-brand nr-glitch">NEON<b>RIDE</b></div>
        <div className="nr-tag">Night-city mobility</div>
        <div className="nr-seg mb-3" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(null); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setErr(null); }}>Create account</button>
        </div>
        <form onSubmit={submit} className="nr-panel nr-panel--glow" noValidate={false}>
          {mode === "register" && (
            <>
              <span className="nr-label">I want to</span>
              <div className="nr-seg mb-3">
                <button type="button" className={role === "rider" ? "on" : ""} onClick={() => setRole("rider")}>Ride</button>
                <button type="button" className={role === "driver" ? "on" : ""} onClick={() => setRole("driver")}>Drive</button>
              </div>
              <label className="form-label" htmlFor="a-name">Full name</label>
              <input id="a-name" className="form-control mb-1" value={f.fullName} onChange={set("fullName")} required minLength={2} autoComplete="name" />{fe("fullName")}
              <div className="mb-2" />
            </>
          )}
          <label className="form-label" htmlFor="a-email">Email</label>
          <input id="a-email" type="email" className="form-control mb-1" value={f.email} onChange={set("email")} required autoComplete="email" inputMode="email" />{fe("email")}
          {mode === "register" && (
            <>
              <div className="mb-2" />
              <label className="form-label" htmlFor="a-phone">Phone (optional)</label>
              <input id="a-phone" className="form-control mb-1" value={f.phone} onChange={set("phone")} placeholder="+639171234567" inputMode="tel" autoComplete="tel" />{fe("phone")}
            </>
          )}
          <div className="mb-2" />
          <label className="form-label" htmlFor="a-pass">Password</label>
          <input id="a-pass" type="password" className="form-control mb-1" value={f.password} onChange={set("password")} required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />{fe("password")}
          {mode === "register" && <div className="nr-muted small mb-2">8+ characters with upper, lower and a digit.</div>}
          {err && <div className="nr-error my-2" role="alert">{err}</div>}
          <button className="btn-cp btn-block mt-2" disabled={busy}>{busy ? "Connecting…" : mode === "login" ? "Jack in" : "Create account"}</button>
        </form>
      </div>
    </div>
  );
}
