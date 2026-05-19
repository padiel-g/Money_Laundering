import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import RiskBadge from "../components/RiskBadge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const STATUSES = ["", "open", "under_review", "resolved"];

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("");
  const nav = useNavigate();

  const load = async () => {
    const params = filter ? { status: filter } : {};
    const { data } = await apiClient.get("/alerts", { params });
    setAlerts(data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const updateStatus = async (id, status) => {
    await apiClient.patch(`/alerts/${id}`, { status });
    toast.success(`Alert ${status.replace('_', ' ')}`);
    load();
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto" data-testid="alerts-page">
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-1">Real-time</p>
        <h1 className="font-display font-black text-3xl tracking-tight text-slate-900">Alert Queue</h1>
        <p className="text-sm text-slate-600 mt-1">Triage suspicious transactions in order of risk severity.</p>
      </div>

      <div className="mb-4 flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            data-testid={`alert-filter-${s || 'all'}`}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border rounded-sm transition-colors ${
              filter === s ? 'bg-blue-800 text-white border-blue-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="space-y-2" data-testid="alerts-list">
        {alerts.map((a) => (
          <div
            key={a.id}
            data-testid={`alert-row-${a.id}`}
            className={`bg-white border border-slate-200 rounded-sm p-4 flex items-center gap-4 ${
              a.severity === 'high' && a.status === 'open' ? 'border-l-4 border-l-rose-600' :
              a.severity === 'medium' && a.status === 'open' ? 'border-l-4 border-l-amber-500' : ''
            }`}
          >
            <RiskBadge level={a.severity} />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900">{a.reason}</div>
              <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                Tx {a.transaction_id.slice(0, 8)} · {new Date(a.created_at).toLocaleString()} · status: {a.status}
              </div>
            </div>
            <button
              data-testid={`alert-view-${a.id}`}
              onClick={() => nav(`/investigation?tx=${a.transaction_id}`)}
              className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-slate-300 hover:bg-slate-50 rounded-sm"
            >Investigate</button>
            {a.status === "open" && (
              <button
                data-testid={`alert-review-${a.id}`}
                onClick={() => updateStatus(a.id, "under_review")}
                className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-sm"
              >Review</button>
            )}
            {a.status !== "resolved" && (
              <button
                data-testid={`alert-resolve-${a.id}`}
                onClick={() => updateStatus(a.id, "resolved")}
                className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-sm"
              >Resolve</button>
            )}
          </div>
        ))}
        {alerts.length === 0 && (
          <div className="text-center py-12 text-slate-500 font-mono text-sm bg-white border border-slate-200 rounded-sm">No alerts.</div>
        )}
      </div>
    </div>
  );
}
