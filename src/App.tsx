import { useEffect, useState } from "react";
import { Icons } from "./components/ui";
import AuthPage from "./pages/AuthPage";
import DriverPage from "./pages/DriverPage";
import HistoryPage from "./pages/HistoryPage";
import ProfilePage from "./pages/ProfilePage";
import RiderPage from "./pages/RiderPage";
import { useAuth } from "./state/auth";

type Tab = "ride" | "history" | "profile";

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false);
    window.addEventListener("online", u); window.addEventListener("offline", d);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", d); };
  }, []);
  return on;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="nr-splash"><div className="nr-brand nr-glitch" style={{ fontSize: "1.8rem" }}><b>OPHIR</b></div></div>;
  if (!user) return <AuthPage />;
  if (user.role === "admin") return <AdminNotice />;
  return <Shell role={user.role} />;
}

function Shell({ role }: { role: "rider" | "driver" }) {
  const [tab, setTab] = useState<Tab>("ride");
  const online = useOnline();
  const tabs: [Tab, string, JSX.Element][] = [["ride", role === "driver" ? "Drive" : "Ride", role === "driver" ? Icons.drive : Icons.ride], ["history", "History", Icons.history], ["profile", "Profile", Icons.profile]];
  return (
    <div className="nr-app">
      <header className="nr-header">
        <div className="nr-brand"><b>OPHIR</b></div>
        <span className="nr-chip nr-chip--on">{role}</span>
      </header>
      {!online && <div className="nr-offline" role="alert">Offline: reconnecting…</div>}
      <main className="nr-main">
        {/* Pages stay mounted so a driver keeps sending heartbeats and a rider keeps tracking while browsing history. */}
        <section hidden={tab !== "ride"}>{role === "driver" ? <DriverPage active={tab === "ride"} /> : <RiderPage active={tab === "ride"} />}</section>
        <section hidden={tab !== "history"}><HistoryPage role={role} active={tab === "history"} /></section>
        <section hidden={tab !== "profile"}><ProfilePage active={tab === "profile"} /></section>
      </main>
      <nav className="nr-nav" aria-label="Main">
        {tabs.map(([k, label, icon]) => <button key={k} className={tab === k ? "active" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{icon}{label}</button>)}
      </nav>
    </div>
  );
}

function AdminNotice() {
  const { logout } = useAuth();
  return (
    <div className="nr-auth"><div className="nr-auth-card nr-panel">
      <h2 className="nr-h">Admin account</h2>
      <p className="nr-muted">Admin accounts use the API and Postman collection. This app is for riders and drivers.</p>
      <button className="btn-cp btn-block" onClick={logout}>Sign out</button>
    </div></div>
  );
}
