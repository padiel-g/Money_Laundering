import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/api";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MagnifyingGlass, Funnel, Download } from "@phosphor-icons/react";
import RiskBadge from "../components/RiskBadge";
import { API } from "../lib/api";

const INSTITUTIONS = ["", "CBZ Bank", "Stanbic Bank", "Steward Bank", "ZB Bank", "FBC Bank", "Nedbank ZW", "EcoCash", "OneMoney", "InnBucks"];

export default function Transactions() {
  const [params] = useSearchParams();
  const focusId = params.get("focus");
  const [txs, setTxs] = useState([]);
  const [filters, setFilters] = useState({ risk_level: "", institution: "", channel: "", flagged_only: false });
  const [search, setSearch] = useState("");
  const nav = useNavigate();

  const load = async () => {
    const cleaned = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== "" && v !== false));
    const { data } = await apiClient.get("/transactions", { params: cleaned });
    setTxs(data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);

  const filtered = useMemo(() => {
    if (!search.trim()) return txs;
    const q = search.toLowerCase();
    return txs.filter(t =>
      t.sender_name.toLowerCase().includes(q) ||
      t.receiver_name.toLowerCase().includes(q) ||
      t.sender_account.toLowerCase().includes(q) ||
      t.receiver_account.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  }, [txs, search]);

  const downloadCsv = async () => {
    const token = localStorage.getItem("aml_token");
    const res = await fetch(`${API}/export/transactions.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "aml_transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto" data-testid="transactions-page">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-1">Ledger</p>
          <h1 className="font-display font-black text-3xl tracking-tight text-slate-900">Transaction Monitor</h1>
          <p className="text-sm text-slate-600 mt-1">All transactions scored by the deep-learning, NLP and graph engines.</p>
        </div>
        <button
          data-testid="export-csv-button"
          onClick={downloadCsv}
          className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors"
        >
          <Download size={14} weight="bold" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-sm p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="md:col-span-2 relative">
          <MagnifyingGlass size={16} className="absolute top-3 left-3 text-slate-400" />
          <input
            data-testid="search-input"
            placeholder="Search account, name, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-slate-300 rounded-sm pl-9 pr-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-800"
          />
        </div>
        <select
          data-testid="filter-risk"
          value={filters.risk_level}
          onChange={(e) => setFilters({ ...filters, risk_level: e.target.value })}
          className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono"
        >
          <option value="">All Risk</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          data-testid="filter-institution"
          value={filters.institution}
          onChange={(e) => setFilters({ ...filters, institution: e.target.value })}
          className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono"
        >
          {INSTITUTIONS.map((i) => <option key={i} value={i}>{i || "All Institutions"}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-700 font-bold">
          <input
            data-testid="filter-flagged-only"
            type="checkbox"
            checked={filters.flagged_only}
            onChange={(e) => setFilters({ ...filters, flagged_only: e.target.checked })}
          />
          Flagged only
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden" data-testid="transactions-table">
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">From</th>
                <th className="text-left px-4 py-3">To</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-center px-4 py-3">Risk</th>
                <th className="text-right px-4 py-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  data-testid={`tx-row-${t.id}`}
                  onClick={() => nav(`/investigation?tx=${t.id}`)}
                  className={`border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors ${focusId === t.id ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{new Date(t.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-900 text-sm">{t.sender_name}</div>
                    <div className="font-mono text-[10px] text-slate-500">{t.sender_institution} · {t.sender_account}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-900 text-sm">{t.receiver_name}</div>
                    <div className="font-mono text-[10px] text-slate-500">{t.receiver_institution} · {t.receiver_account}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">${t.amount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 max-w-[280px] truncate">{t.description}</td>
                  <td className="px-4 py-2.5 text-center"><RiskBadge level={t.risk_level} /></td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{t.risk_score.toFixed(2)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500 font-mono text-sm">No transactions match filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        Showing {filtered.length} of {txs.length} transactions
      </div>
    </div>
  );
}
