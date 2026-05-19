import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ChartLine, ListChecks, Graph, FileText, Bell, SignOut, ShieldCheck, Lightning
} from "@phosphor-icons/react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: ChartLine, testid: "nav-dashboard" },
  { to: "/transactions", label: "Transactions", icon: ListChecks, testid: "nav-transactions" },
  { to: "/simulator", label: "Simulator", icon: Lightning, testid: "nav-simulator" },
  { to: "/investigation", label: "Investigation", icon: Graph, testid: "nav-investigation" },
  { to: "/alerts", label: "Alerts", icon: Bell, testid: "nav-alerts" },
  { to: "/sars", label: "SAR Reports", icon: FileText, testid: "nav-sars" },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col" data-testid="app-sidebar">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck size={26} weight="duotone" className="text-blue-800" />
            <div>
              <div className="font-display font-black text-base tracking-tight text-slate-900">AML/ZW</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Detection Suite</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, testid }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm transition-colors ${
                  isActive
                    ? "bg-blue-800 text-white font-semibold"
                    : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <Icon size={18} weight="bold" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          {user && (
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-900" data-testid="current-user-name">{user.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{user.role}</div>
            </div>
          )}
          <button
            data-testid="logout-button"
            onClick={() => { logout(); nav("/login"); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-wider text-slate-700 border border-slate-300 hover:border-rose-400 hover:text-rose-700 hover:bg-rose-50 rounded-sm transition-colors"
          >
            <SignOut size={14} weight="bold" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto thin-scroll">
        {children}
      </main>
    </div>
  );
}
