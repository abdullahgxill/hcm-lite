import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AppLayout from "./layouts/AppLayout";
import { AuthPage, PasswordPage } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Employees, { EmployeeProfile } from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Payroll from "./pages/Payroll";
import Settings from "./pages/Settings";
import DeviceCheck from "./pages/DeviceCheck";
import {
  Announcements,
  Notifications,
  Audit,
  Users,
} from "./pages/Communication";
function Guard({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}
export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (location.pathname === "/device-check") return <DeviceCheck />;
  if (loading)
    return <div className="state full-state">Opening your workspace…</div>;
  if (!user) return <AuthPage />;
  if (user.mustChangePassword)
    return (
      <main className="first-password">
        <PasswordPage />
      </main>
    );
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route
          path="employees"
          element={
            <Guard roles={["ADMIN", "HR"]}>
              <Employees />
            </Guard>
          }
        />
        <Route
          path="profile"
          element={
            <Guard roles={["EMPLOYEE"]}>
              <EmployeeProfile employeeId={user.employeeId} />
            </Guard>
          }
        />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leave" element={<Leave />} />
        <Route path="payroll" element={<Payroll />} />
        <Route
          path="settings"
          element={
            <Guard roles={["ADMIN", "HR"]}>
              <Settings />
            </Guard>
          }
        />
        <Route
          path="users"
          element={
            <Guard roles={["ADMIN"]}>
              <Users />
            </Guard>
          }
        />
        <Route path="announcements" element={<Announcements />} />
        <Route path="notifications" element={<Notifications />} />
        <Route
          path="audit"
          element={
            <Guard roles={["ADMIN"]}>
              <Audit />
            </Guard>
          }
        />
        <Route path="password" element={<PasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
