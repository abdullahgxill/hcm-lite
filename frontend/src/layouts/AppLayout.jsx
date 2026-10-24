import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Clock3,
  CalendarDays,
  Wallet,
  Settings2,
  Bell,
  Megaphone,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Sparkles,
  Layers3,
  KeyRound,
  UserRound,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import Assistant from "../features/Assistant";
const nav = [
  ["/", "Overview", LayoutDashboard, ["ADMIN", "HR", "EMPLOYEE"]],
  ["/employees", "People", Users, ["ADMIN", "HR"]],
  ["/profile", "My profile", UserRound, ["EMPLOYEE"]],
  ["/attendance", "Attendance", Clock3, ["ADMIN", "HR", "EMPLOYEE"]],
  ["/leave", "Leave management", CalendarDays, ["ADMIN", "HR", "EMPLOYEE"]],
  ["/payroll", "Payroll & payslips", Wallet, ["ADMIN", "HR", "EMPLOYEE"]],
  ["/announcements", "Announcements", Megaphone, ["ADMIN", "HR", "EMPLOYEE"]],
  ["/audit", "Audit trail", ShieldCheck, ["ADMIN"]],
  ["/settings", "Organization", Settings2, ["ADMIN", "HR"]],
  ["/users", "Access management", KeyRound, ["ADMIN"]],
  ["/password", "Change password", KeyRound, ["ADMIN", "HR", "EMPLOYEE"]],
];
export default function AppLayout() {
  const { user, logout } = useAuth(),
    [open, setOpen] = useState(false),
    [ai, setAI] = useState(false),
    location = useLocation();
  const notifications = useResource("/notifications"),
    count = notifications.data?.filter((n) => !n.read).length || 0;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {open && (
        <button
          className="nav-shade"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <Layers3 size={22} />
          </span>
          hcm<span className="brand-lite">lite</span>
        </NavLink>
        <div className="workspace-tag">
          <span className="status-dot" /> PEOPLE WORKSPACE{" "}
          <span>{user.role}</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav
            .filter((n) => n[3].includes(user.role))
            .map(([path, label, Icon]) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                onClick={() => setOpen(false)}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="assistant-nav"
            onClick={() => {
              setAI(true);
              setOpen(false);
            }}
          >
            <Sparkles size={18} />
            <span>
              Ask your assistant<small>Clarity from your live data</small>
            </span>
          </button>
          <div className="sidebar-user">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role.toLowerCase()}</small>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>
              {nav.find((n) => n[0] === location.pathname)?.[1] || "Account"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="today-label">
              {new Intl.DateTimeFormat("en", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Karachi",
              }).format(new Date())}
            </span>
            <NavLink
              to="/notifications"
              className="icon-button notification-bell"
              aria-label={`Notifications, ${count} unread`}
            >
              <Bell size={19} />
              {count > 0 && <i />}
            </NavLink>
            <NavLink
              to="/password"
              className="avatar"
              aria-label="Account password"
            >
              {user.name.slice(0, 1)}
            </NavLink>
          </div>
        </header>
        <main id="main" className="main-content">
          <Outlet context={{ openAI: () => setAI(true) }} />
        </main>
        <footer className="app-footer">
          HCM Lite <span>A clearer way to work with people.</span>
        </footer>
      </div>
      {ai && <Assistant onClose={() => setAI(false)} />}
    </div>
  );
}
