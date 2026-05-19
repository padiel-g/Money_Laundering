import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Investigation from "./pages/Investigation";
import Alerts from "./pages/Alerts";
import SARs from "./pages/SARs";
import Simulator from "./pages/Simulator";

function AdminLoading() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <div className="h-10 w-10 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
        <div className="text-xs font-mono uppercase tracking-[0.25em]">Loading control room...</div>
      </div>
    </div>
  );
}

function AdminProtected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AdminLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <AdminLoading />;
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

function AdminLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<AdminRedirect />} />
          <Route
            path="/dashboard"
            element={<AdminProtected><AdminLayout><Dashboard /></AdminLayout></AdminProtected>}
          />
          <Route
            path="/transactions"
            element={<AdminProtected><AdminLayout><Transactions /></AdminLayout></AdminProtected>}
          />
          <Route
            path="/simulator"
            element={<AdminProtected><AdminLayout><Simulator /></AdminLayout></AdminProtected>}
          />
          <Route
            path="/investigation"
            element={<AdminProtected><AdminLayout><Investigation /></AdminLayout></AdminProtected>}
          />
          <Route
            path="/alerts"
            element={<AdminProtected><AdminLayout><Alerts /></AdminLayout></AdminProtected>}
          />
          <Route
            path="/sars"
            element={<AdminProtected><AdminLayout><SARs /></AdminLayout></AdminProtected>}
          />
          <Route path="*" element={<AdminRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
