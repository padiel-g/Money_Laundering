import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { ArrowsClockwise, TrendUp, Warning, Bell, FileText } from "@phosphor-icons/react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import RiskBadge from "../components/RiskBadge";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const STAT_CARDS = (s) => [
  { label: "Transactions Monitored", value: s.total_tx, icon: TrendUp, color: "text-blue-800", testid: "stat-total-tx" },
  { label: "Flagged Transactions", value: s.total_flagged, icon: Warning, color: "text-rose-700", testid: "stat-flagged" },
  { label: "Open Alerts", value: s.open_alerts, icon: Bell, color: "text-amber-700", testid: "stat-open-alerts" },
  { label: "SARs Filed", value: s.sars, icon: FileText, color: "text-emerald-700", testid: "stat-sars" },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [feed, setFeed] = useState([]);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    const [st, al, lf] = await Promise.all([
      apiClient.get("/dashboard/stats"),
      apiClient.get("/alerts", { params: { status: "open" } }),
      apiClient.get("/admin/live-feed"),
    ]);
    setStats(st.data);
    setAlerts(al.data.slice(0, 8));
    setFeed(lf.data);
  };

  useEffect(() => { load(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      await apiClient.post("/scan/run");
      toast.success("Detection scan complete");
      await load();
    } catch (e) {
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  if (!stats) {
    return <div className="p-10 text-slate-500 font-mono text-sm">Loading control room…</div>;
  }

  const riskPie = [
    { name: "High", value: stats.high, color: "#E11D48" },
    { name: "Medium", value: stats.medium, color: "#D97706" },
    { name: "Low", value: stats.low, color: "#059669" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto" data-testid="dashboard-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-1">Control Room</p>
          <h1 className="font-display font-black text-3xl tracking-tight text-slate-900">Transaction Monitoring</h1>
          <p className="text-sm text-slate-600 mt-1">Central AML dashboard for monitored banking and mobile-money activity.</p>
        </div>
        <button
          data-testid="run-scan-button"
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white px-4 py-2 rounded-sm text-sm font-semibold transition-colors"
        >
          <ArrowsClockwise size={16} weight="bold" className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning..." : "Run Detection Scan"}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS(stats).map((c) => (
          <div key={c.label} data-testid={c.testid} className="bg-white border border-slate-200 rounded-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <c.icon size={22} weight="duotone" className={c.color} />
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">live</span>
            </div>
            <div className="font-display font-black text-3xl text-slate-900">{c.value}</div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Volume timeseries */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-slate-900">Transaction Volume — last 14 days</h3>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">USD</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={stats.timeseries}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="#64748B" />
              <YAxis tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="#64748B" />
              <Tooltip contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 12, borderRadius: 2 }} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'IBM Plex Mono' }} />
              <Line type="monotone" dataKey="volume" stroke="#002FA7" strokeWidth={2} dot={false} name="Volume USD" />
              <Line type="monotone" dataKey="flagged_count" stroke="#E11D48" strokeWidth={2} dot={false} name="Flagged" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Risk distribution */}
        <div className="bg-white border border-slate-200 rounded-sm p-5">
          <h3 className="font-display font-bold text-slate-900 mb-4">Risk Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={riskPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {riskPie.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {riskPie.map((d) => (
              <div key={d.name} className="text-center">
                <div className="font-mono text-lg font-bold" style={{ color: d.color }}>{d.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{d.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By institution */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-sm p-5">
          <h3 className="font-display font-bold text-slate-900 mb-4">Activity by Institution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.by_institution} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="#64748B" />
              <YAxis type="category" dataKey="institution" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} stroke="#64748B" width={110} />
              <Tooltip contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'IBM Plex Mono' }} />
              <Bar dataKey="count" fill="#002FA7" name="Total" />
              <Bar dataKey="flagged" fill="#E11D48" name="Flagged" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Live alerts feed */}
        <div className="bg-white border border-slate-200 rounded-sm p-5" data-testid="alerts-feed">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-slate-900">Live Alerts</h3>
            <Link to="/alerts" className="text-[10px] font-mono uppercase tracking-wider text-blue-800 hover:underline">View all</Link>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto thin-scroll">
            {alerts.length === 0 && <div className="text-sm text-slate-500 font-mono">No open alerts.</div>}
            {alerts.map((a) => (
              <Link
                key={a.id}
                to={`/transactions?focus=${a.transaction_id}`}
                data-testid={`alert-item-${a.id}`}
                className={`block p-3 border border-slate-200 hover:border-blue-400 rounded-sm bg-slate-50 hover:bg-white transition-all ${
                  a.severity === 'high' ? 'border-l-4 border-l-rose-600' : a.severity === 'medium' ? 'border-l-4 border-l-amber-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <RiskBadge level={a.severity} />
                  <span className="font-mono text-[10px] text-slate-500">{new Date(a.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="text-xs text-slate-700 font-mono leading-snug line-clamp-2">{a.reason}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-slate-900">Transaction Feed</h3>
            <p className="text-xs text-slate-500 mt-1">Latest transactions across monitored institutions with AML Risk Score.</p>
          </div>
          <Link to="/transactions" className="text-[10px] font-mono uppercase tracking-wider text-blue-800 hover:underline">Open ledger</Link>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Sender Institution</th>
                <th className="text-left px-4 py-3">Receiver Institution</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">AML Reason / Signals</th>
                <th className="text-center px-4 py-3">Risk Level</th>
                <th className="text-right px-4 py-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((t) => {
                const signals = [...(t.dl_signals || []), ...(t.graph_signals || [])];
                if (t.nlp_keywords?.length) signals.push(`Keywords: ${t.nlp_keywords.join(", ")}`);
                return (
                  <tr key={t.id} className={`border-b border-slate-100 ${t.flagged ? "bg-rose-50/50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{new Date(t.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{t.sender_institution}</div>
                      <div className="font-mono text-[10px] text-slate-500">{t.sender_account}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{t.receiver_institution}</div>
                      <div className="font-mono text-[10px] text-slate-500">{t.receiver_account}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{t.currency} {t.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-[360px] truncate">{signals.join(" | ") || "No suspicious indicators"}</td>
                    <td className="px-4 py-3 text-center"><RiskBadge level={t.risk_level} /></td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{t.risk_score.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
