import React, { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { FileText, Download } from "@phosphor-icons/react";

export default function SARs() {
  const [sars, setSars] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => { apiClient.get("/sars").then((r) => setSars(r.data)); }, []);

  const exportJson = (sar) => {
    const blob = new Blob([JSON.stringify(sar, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${sar.reference_no}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto" data-testid="sars-page">
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-1">Reports</p>
        <h1 className="font-display font-black text-3xl tracking-tight text-slate-900">Suspicious Activity Reports</h1>
        <p className="text-sm text-slate-600 mt-1">Filed reports submitted to the Financial Intelligence Unit (FIU).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sars.map((s) => (
          <div key={s.id} data-testid={`sar-card-${s.id}`} className="bg-white border border-slate-200 rounded-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{s.reference_no}</p>
                <h3 className="font-display font-bold text-slate-900 mt-1 flex items-center gap-2">
                  <FileText size={16} weight="duotone" className="text-blue-800" /> {s.primary_subject}
                </h3>
              </div>
              <button
                data-testid={`sar-download-${s.id}`}
                onClick={() => exportJson(s)}
                className="p-2 border border-slate-300 hover:bg-slate-50 rounded-sm">
                <Download size={14} weight="bold" />
              </button>
            </div>
            <p className="text-xs font-mono text-slate-700 mb-2 line-clamp-3">{s.summary}</p>
            <p className="text-xs text-slate-500 italic">{s.risk_assessment}</p>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between font-mono text-[10px] text-slate-500">
              <span>Filed by {s.created_by}</span>
              <span>{new Date(s.created_at).toLocaleString()}</span>
            </div>
          </div>
        ))}
        {sars.length === 0 && (
          <div className="lg:col-span-2 text-center py-12 text-slate-500 font-mono text-sm bg-white border border-slate-200 rounded-sm">
            No SARs filed yet. Investigate a suspicious transaction to file a report.
          </div>
        )}
      </div>
    </div>
  );
}
