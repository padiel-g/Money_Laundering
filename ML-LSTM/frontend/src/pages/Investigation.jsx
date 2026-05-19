import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../lib/api";
import ForceGraph2D from "react-force-graph-2d";
import RiskBadge from "../components/RiskBadge";
import {
  ArrowsClockwise,
  Crosshair,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileCsv,
  FileText,
  Flag,
  Graph as GraphIcon,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  PauseCircle,
  SlidersHorizontal,
  Target,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const RISK_COLOR = { high: "#E11D48", medium: "#D97706", low: "#059669" };
const RISK_BG = { high: "rgba(225, 29, 72, 0.12)", medium: "rgba(217, 119, 6, 0.14)", low: "rgba(5, 150, 105, 0.12)" };
const INSTITUTIONS = ["", "EcoCash", "InnBucks", "CBZ Bank", "ZB Bank", "FBC Bank", "Stanbic Bank", "Nedbank ZW", "OneMoney", "Steward Bank"];
const PATTERNS = ["", "Structuring", "Layering", "Rapid movement", "Round-tripping", "Mule account", "High-value transfer"];
const CHANNELS = ["", ...INSTITUTIONS.filter(Boolean), "bank", "mobile_money"];

const money = (value) => `$${Number(value || 0).toLocaleString()}`;
const pct = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const fmtDate = (value) => value ? new Date(value).toLocaleString() : "-";
const maskAccount = (id = "") => id.length > 8 ? `${id.slice(0, 4)}...${id.slice(-4)}` : id;

const defaultFilters = {
  risk_level: "",
  institution: "",
  min_amount: "",
  date_from: "",
  date_to: "",
  pattern_type: "",
  channel: "",
  min_risk_score: "",
  suspicious_only: false,
  connected_only: false,
};

function paramsFromFilters(filters, selectedAccount) {
  const entries = Object.entries(filters).filter(([, value]) => value !== "" && value !== false);
  const params = Object.fromEntries(entries);
  if (params.min_risk_score) params.min_risk_score = Number(params.min_risk_score) / 100;
  if (filters.connected_only && selectedAccount) params.account_id = selectedAccount;
  return params;
}

export default function Investigation() {
  const graphRef = useRef();
  const wrapperRef = useRef();
  const [filters, setFilters] = useState(defaultFilters);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountProfile, setAccountProfile] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [showEdgeAmounts, setShowEdgeAmounts] = useState(false);
  const [onlySuspiciousPaths, setOnlySuspiciousPaths] = useState(false);
  const [hoverNode, setHoverNode] = useState(null);
  const [hoverLink, setHoverLink] = useState(null);

  const queryParams = useMemo(() => paramsFromFilters({ ...filters, suspicious_only: filters.suspicious_only || onlySuspiciousPaths }, selectedAccount), [filters, onlySuspiciousPaths, selectedAccount]);

  const loadInvestigation = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [graphRes, metricsRes, patternsRes, timelineRes] = await Promise.all([
        apiClient.get("/investigation/graph", { params: queryParams }),
        apiClient.get("/investigation/metrics", { params: queryParams }),
        apiClient.get("/investigation/patterns", { params: queryParams }),
        apiClient.get("/investigation/timeline", { params: { account_id: selectedAccount || undefined, suspicious_only: filters.suspicious_only || onlySuspiciousPaths } }),
      ]);
      setGraph(graphRes.data);
      setMetrics(metricsRes.data);
      setPatterns(patternsRes.data);
      setTimeline(timelineRes.data);
      if (selectedAccount) {
        try {
          const accountRes = await apiClient.get(`/investigation/account/${encodeURIComponent(selectedAccount)}`);
          setAccountProfile(accountRes.data);
        } catch {
          setAccountProfile(null);
        }
      }
      setTimeout(() => graphRef.current?.zoomToFit?.(600, 60), 150);
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to load investigation graph.");
    } finally {
      setLoading(false);
    }
  }, [filters.suspicious_only, onlySuspiciousPaths, queryParams, selectedAccount]);

  useEffect(() => { loadInvestigation(); }, [loadInvestigation]);

  const activeFilters = useMemo(() => Object.entries(filters).filter(([, v]) => v !== "" && v !== false), [filters]);

  const graphData = useMemo(() => ({
    nodes: graph.nodes || [],
    links: graph.links || [],
  }), [graph]);

  const selectNode = async (node) => {
    setSelectedAccount(node.id);
    setSelectedEdge(null);
    try {
      const [{ data: profile }, { data: txTimeline }] = await Promise.all([
        apiClient.get(`/investigation/account/${encodeURIComponent(node.id)}`),
        apiClient.get("/investigation/timeline", { params: { account_id: node.id, suspicious_only: filters.suspicious_only || onlySuspiciousPaths } }),
      ]);
      setAccountProfile(profile);
      setTimeline(txTimeline);
      toast.message(node.name, { description: `${node.institution} - ${maskAccount(node.id)}` });
    } catch {
      toast.error("Unable to load account profile");
    }
  };

  const selectLink = async (link) => {
    const txId = link.transactions?.[0];
    if (!txId) {
      setSelectedEdge(link);
      return;
    }
    try {
      const { data } = await apiClient.get(`/investigation/transaction/${txId}`);
      setSelectedEdge({ ...link, detail: data });
      toast.message(`${data.sender_name} -> ${data.receiver_name}`, { description: `${money(data.amount)} - ${data.risk_level.toUpperCase()}` });
    } catch {
      setSelectedEdge(link);
    }
  };

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clearFilter = (key) => setFilters((prev) => ({ ...prev, [key]: defaultFilters[key] }));

  const fitView = () => graphRef.current?.zoomToFit?.(600, 70);
  const resetView = () => {
    graphRef.current?.d3ReheatSimulation?.();
    setTimeout(() => graphRef.current?.zoomToFit?.(700, 70), 120);
  };
  const zoomBy = (factor) => {
    const current = graphRef.current?.zoom?.() || 1;
    graphRef.current?.zoom?.(current * factor, 300);
  };

  const exportPng = () => {
    const canvas = wrapperRef.current?.querySelector("canvas");
    if (!canvas) return toast.error("Graph canvas not available");
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "aml-investigation-network.png";
    link.click();
  };

  const clearNetwork = () => {
    setGraph({ nodes: [], links: [] });
    setSelectedAccount(null);
    setAccountProfile(null);
    setSelectedEdge(null);
    setTimeline([]);
    toast.success("Fund flow network cleared", { description: "Use Refresh or change filters to load the network again." });
  };
  const exportCsv = () => {
    const rows = [["source", "target", "amount", "count", "risk", "pattern", "reason"]];
    graphData.links.forEach((l) => rows.push([l.source?.id || l.source, l.target?.id || l.target, l.amount, l.count, l.risk, l.pattern, l.reason]));
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aml-investigation-edges.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const demoAction = (label) => toast.success(label, { description: "Demo action recorded for this investigation session." });

  return (
    <div className="p-6 lg:p-8 max-w-[1800px] mx-auto" data-testid="investigation-page">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-1">Investigation</p>
          <h1 className="font-display font-black text-3xl tracking-tight text-slate-900">Layering Network Analysis</h1>
          <p className="text-sm text-slate-600 mt-1">Professional fund-flow graph, account profiling, pattern detection, and timeline reconstruction.</p>
        </div>
        <button onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors">
          <ArrowsClockwise size={14} weight="bold" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
        <Metric label="Total Accounts" value={metrics?.total_accounts ?? 0} />
        <Metric label="Transactions" value={metrics?.total_transactions ?? 0} />
        <Metric label="Suspicious" value={metrics?.suspicious_transactions ?? 0} tone="rose" />
        <Metric label="High-Risk Accounts" value={metrics?.high_risk_accounts ?? 0} tone="rose" />
        <Metric label="Amount Flagged" value={money(metrics?.total_amount_flagged)} />
        <Metric label="Avg Risk" value={pct(metrics?.average_risk_score)} />
        <Metric label="SAR Candidates" value={metrics?.sar_candidates ?? 0} tone="amber" />
        <Metric label="Institutions" value={metrics?.institutions_involved ?? 0} />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-4 mb-4" data-testid="investigation-filters">
        <div className="flex items-center gap-2 text-slate-700 font-display font-bold mb-3"><SlidersHorizontal size={18} /> Graph Filters</div>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <select value={filters.risk_level} onChange={(e) => updateFilter("risk_level", e.target.value)} className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"><option value="">All risk</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <select value={filters.institution} onChange={(e) => updateFilter("institution", e.target.value)} className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800">{INSTITUTIONS.map((i) => <option key={i} value={i}>{i || "All institutions"}</option>)}</select>
          <select value={filters.channel} onChange={(e) => updateFilter("channel", e.target.value)} className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800">{CHANNELS.map((i) => <option key={i} value={i}>{i || "All channels"}</option>)}</select>
          <select value={filters.pattern_type} onChange={(e) => updateFilter("pattern_type", e.target.value)} className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800">{PATTERNS.map((p) => <option key={p} value={p}>{p || "All patterns"}</option>)}</select>
          <input value={filters.min_amount} onChange={(e) => updateFilter("min_amount", e.target.value)} type="number" min="0" placeholder="Min amount" className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800" />
          <input value={filters.min_risk_score} onChange={(e) => updateFilter("min_risk_score", e.target.value)} type="number" min="0" max="100" placeholder="Min risk %" className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800" />
          <input value={filters.date_from} onChange={(e) => updateFilter("date_from", e.target.value)} type="date" className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800" />
          <input value={filters.date_to} onChange={(e) => updateFilter("date_to", e.target.value)} type="date" className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-800" />
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-700 font-bold"><input type="checkbox" checked={filters.suspicious_only} onChange={(e) => updateFilter("suspicious_only", e.target.checked)} /> Suspicious only</label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-700 font-bold"><input type="checkbox" checked={filters.connected_only} onChange={(e) => updateFilter("connected_only", e.target.checked)} /> Connected network</label>
        </div>
        {activeFilters.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{activeFilters.map(([k, v]) => <button key={k} onClick={() => clearFilter(k)} className="border border-blue-200 bg-blue-50 text-blue-800 px-2 py-1 rounded-sm font-mono text-[10px] uppercase tracking-wider">{k.replaceAll("_", " ")}: {String(v)} x</button>)}</div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-sm p-4" data-testid="network-graph">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
            <div>
              <h3 className="font-display font-bold text-slate-900 flex items-center gap-2"><GraphIcon size={18} weight="duotone" /> Fund Flow Network</h3>
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 mt-1">{graphData.nodes.length} nodes - {graphData.links.length} edges</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ToolButton label="Zoom in" onClick={() => zoomBy(1.25)} icon={<MagnifyingGlassPlus size={14} />} />
              <ToolButton label="Zoom out" onClick={() => zoomBy(0.8)} icon={<MagnifyingGlassMinus size={14} />} />
              <ToolButton label="Fit view" onClick={fitView} icon={<Target size={14} />} />
              <ToolButton label="Reset layout" onClick={resetView} icon={<ArrowsClockwise size={14} />} />
              <ToolButton label="Export PNG" onClick={exportPng} icon={<DownloadSimple size={14} />} />
              <ToolButton label="Export CSV" onClick={exportCsv} icon={<FileCsv size={14} />} />
              <ToolButton label="Labels" onClick={() => setShowLabels((v) => !v)} icon={showLabels ? <Eye size={14} /> : <EyeSlash size={14} />} active={showLabels} />
              <ToolButton label="Amounts" onClick={() => setShowEdgeAmounts((v) => !v)} icon={<FileText size={14} />} active={showEdgeAmounts} />
              <ToolButton label="Suspicious paths" onClick={() => setOnlySuspiciousPaths((v) => !v)} icon={<Flag size={14} />} active={onlySuspiciousPaths} />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-3 text-[10px] font-mono uppercase tracking-wider text-slate-500">
            {Object.entries(RISK_COLOR).map(([risk, color]) => <span key={risk} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{risk}</span>)}
            <span>Node size = transaction volume</span><span>Edge thickness = amount</span><span>Arrow = fund direction</span>
          </div>

          <div ref={wrapperRef} className="relative h-[680px] overflow-hidden border border-slate-200 rounded-sm bg-[radial-gradient(circle_at_1px_1px,#dbe3ef_1px,transparent_0)] [background-size:22px_22px]">
            {loading && <StateOverlay text="Loading investigation graph..." />}
            {error && <StateOverlay text={error} danger />}
            {!loading && !error && graphData.nodes.length === 0 && <StateOverlay text="No graph data available for the selected filters." />}
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={wrapperRef.current?.clientWidth || 1000}
              height={680}
              backgroundColor="rgba(255,255,255,0)"
              cooldownTicks={160}
              d3AlphaDecay={0.018}
              d3VelocityDecay={0.28}
              nodeRelSize={1}
              nodeVal={(n) => n.size || 10}
              nodeColor={(n) => RISK_COLOR[n.risk] || "#64748B"}
              nodeLabel={(n) => `${n.name}\n${n.institution}\nRisk: ${n.risk?.toUpperCase()}\nVolume: ${money(n.volume)}`}
              linkLabel={(l) => `Transaction path\nAmount: ${money(l.amount)}\nRisk: ${l.risk?.toUpperCase()}\nPattern: ${l.pattern}`}
              linkColor={(l) => RISK_COLOR[l.risk] || "#94A3B8"}
              linkWidth={(l) => (hoverLink === l ? 4 : Math.max(1.2, Math.min(8, Math.log10((l.amount || 1)) - 2)))}
              linkDirectionalArrowLength={5}
              linkDirectionalArrowRelPos={1}
              linkDirectionalParticles={(l) => (l.risk === "high" ? 3 : l.risk === "medium" ? 2 : 0)}
              linkDirectionalParticleSpeed={0.004}
              onNodeClick={selectNode}
              onLinkClick={selectLink}
              onNodeHover={setHoverNode}
              onLinkHover={setHoverLink}
              nodeCanvasObject={(node, ctx, scale) => drawNode(node, ctx, scale, node.id === selectedAccount, hoverNode === node, showLabels)}
              nodePointerAreaPaint={(node, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x, node.y, (node.size || 10) + 8, 0, 2 * Math.PI); ctx.fill(); }}
              linkCanvasObjectMode={() => showEdgeAmounts ? "after" : undefined}
              linkCanvasObject={(l, ctx, scale) => drawEdgeAmount(l, ctx, scale)}
            />
          </div>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <AccountPanel profile={accountProfile} selectedAccount={selectedAccount} onAction={demoAction} />
          <EdgePanel edge={selectedEdge} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mt-4">
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-sm p-4">
          <h3 className="font-display font-bold text-slate-900 flex items-center gap-2 mb-3"><WarningCircle size={18} weight="duotone" /> Detected AML Patterns</h3>
          <div className="space-y-3 max-h-[520px] overflow-y-auto thin-scroll">
            {patterns.map((p) => <PatternCard key={p.pattern} pattern={p} />)}
            {patterns.length === 0 && <EmptySmall text="No AML patterns detected for the current filters." />}
          </div>
        </div>
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-sm p-4">
          <h3 className="font-display font-bold text-slate-900 flex items-center gap-2 mb-3"><Crosshair size={18} weight="duotone" /> Transaction Timeline</h3>
          <div className="space-y-2 max-h-[520px] overflow-y-auto thin-scroll">
            {timeline.map((t) => <TimelineRow key={t.id} item={t} />)}
            {timeline.length === 0 && <EmptySmall text="No transactions found for the current account or network." />}
          </div>
        </div>
      </div>
    </div>
  );
}

function drawNode(node, ctx, scale, selected, hovered, showLabels) {
  const size = node.size || 10;
  const color = RISK_COLOR[node.risk] || "#64748B";
  ctx.save();
  ctx.shadowColor = selected ? color : hovered ? "rgba(15,23,42,0.35)" : "transparent";
  ctx.shadowBlur = selected ? 18 : hovered ? 10 : 0;
  ctx.fillStyle = RISK_BG[node.risk] || "#F8FAFC";
  ctx.strokeStyle = selected ? "#0F172A" : color;
  ctx.lineWidth = selected ? 3 / scale : 1.6 / scale;
  const isBusiness = node.account_type?.toLowerCase().includes("business");
  if (isBusiness) {
    const r = size / 2;
    ctx.beginPath();
    ctx.roundRect(node.x - r, node.y - r, size, size, Math.max(3, size * 0.18));
    ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(node.x, node.y, size / 2, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(node.x, node.y, Math.max(2.5, size / 5), 0, 2 * Math.PI); ctx.fill();
  if (showLabels && scale > 0.48) {
    const label = node.name?.split(" ").slice(0, 2).join(" ") || node.id;
    ctx.shadowBlur = 0;
    ctx.font = `${Math.max(9, 11 / scale)}px IBM Plex Mono`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const width = ctx.measureText(label).width + 8;
    ctx.fillRect(node.x - width / 2, node.y + size / 2 + 5, width, 15 / scale);
    ctx.fillStyle = "#0F172A";
    ctx.fillText(label, node.x, node.y + size / 2 + 16 / scale);
  }
  ctx.restore();
}

function drawEdgeAmount(link, ctx, scale) {
  const source = typeof link.source === "object" ? link.source : null;
  const target = typeof link.target === "object" ? link.target : null;
  if (!source || !target || scale < 0.85) return;
  const label = money(link.amount);
  const x = source.x + (target.x - source.x) * 0.55;
  const y = source.y + (target.y - source.y) * 0.55;
  ctx.save();
  ctx.font = `${10 / scale}px IBM Plex Mono`;
  const width = ctx.measureText(label).width + 6;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(x - width / 2, y - 8 / scale, width, 14 / scale);
  ctx.fillStyle = "#334155";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 3 / scale);
  ctx.restore();
}

function Metric({ label, value, tone = "blue" }) {
  const color = tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : "text-blue-800";
  return <div className="bg-white border border-slate-200 rounded-sm p-3"><div className={`font-display font-black text-2xl ${color}`}>{value}</div><div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 mt-1">{label}</div></div>;
}

function ToolButton({ label, icon, onClick, active, danger }) {
  const idle = danger ? "border-rose-300 bg-white hover:bg-rose-50 text-rose-700" : "border-slate-300 bg-white hover:bg-slate-50 text-slate-700";
  return <button title={label} onClick={onClick} className={`inline-flex h-8 min-w-8 items-center justify-center gap-1 border px-2 rounded-sm text-[10px] font-mono uppercase tracking-wider transition-colors ${active ? "border-blue-800 bg-blue-50 text-blue-800" : idle}`}>{icon}<span className="hidden 2xl:inline">{label}</span></button>;
}

function StateOverlay({ text, danger }) {
  return <div className={`absolute inset-0 z-10 flex items-center justify-center text-center font-mono text-sm p-8 ${danger ? "text-rose-700" : "text-slate-500"}`}>{text}</div>;
}

function EmptySmall({ text }) {
  return <div className="border border-dashed border-slate-300 rounded-sm p-4 text-sm text-slate-500 font-mono">{text}</div>;
}

function AccountPanel({ profile, selectedAccount, onAction }) {
  return <div className="bg-white border border-slate-200 rounded-sm p-4 max-h-[430px] overflow-y-auto thin-scroll">
    <h3 className="font-display font-bold text-slate-900 mb-3">Account Profile</h3>
    {!profile ? <EmptySmall text="Click an account node to view profile details." /> : <div className="space-y-3">
      <div className="border border-slate-200 bg-slate-50 rounded-sm p-3"><div className="font-semibold text-slate-900">{profile.name}</div><div className="font-mono text-[10px] text-slate-500 mt-1">{profile.masked_account_id || maskAccount(selectedAccount)} - {profile.institution}</div></div>
      <div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Risk level</span><RiskBadge level={profile.risk} /></div>
      <Info label="Account type" value={profile.account_type} /><Info label="Risk score" value={pct(profile.risk_score)} /><Info label="Total sent" value={money(profile.sent)} /><Info label="Total received" value={money(profile.received)} /><Info label="Transactions" value={profile.tx_count} /><Info label="Suspicious tx" value={profile.suspicious_count} /><Info label="Connected accounts" value={profile.connection_count} /><Info label="Last transaction" value={fmtDate(profile.last_transaction)} /><Info label="Investigation status" value={profile.investigation_status} />
      <div className="grid grid-cols-2 gap-2 pt-2"><Action label="View Transactions" onClick={() => onAction("Transactions opened")} /><Action label="Mark Reviewed" onClick={() => onAction("Account marked as reviewed")} /><Action label="Watchlist" onClick={() => onAction("Account added to watchlist")} /><Action label="Generate SAR" onClick={() => onAction("SAR draft generated")} /><Action label="Freeze Demo" onClick={() => onAction("Demo freeze/flag action recorded")} wide /></div>
    </div>}
  </div>;
}

function EdgePanel({ edge }) {
  const d = edge?.detail;
  return <div className="bg-white border border-slate-200 rounded-sm p-4 max-h-[330px] overflow-y-auto thin-scroll">
    <h3 className="font-display font-bold text-slate-900 mb-3">Transaction Details</h3>
    {!edge ? <EmptySmall text="Click an edge to view transaction details." /> : <div className="space-y-2">
      <div className="flex items-center justify-between"><span className="font-semibold text-slate-900">{d ? `${d.sender_name} -> ${d.receiver_name}` : `${edge.source?.name || edge.source} -> ${edge.target?.name || edge.target}`}</span><RiskBadge level={d?.risk_level || edge.risk} /></div>
      <Info label="Amount" value={money(d?.amount || edge.amount)} /><Info label="Institution" value={d ? `${d.sender_institution} -> ${d.receiver_institution}` : "Multiple"} /><Info label="Channel" value={d?.channel || edge.channel || "Mixed"} /><Info label="Date/time" value={fmtDate(d?.timestamp)} /><Info label="Pattern detected" value={d?.pattern || edge.pattern} />
      <div className="border border-slate-200 bg-slate-50 rounded-sm p-3"><div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 mb-1">Suspicion reason</div><p className="text-xs font-mono text-slate-700">{d?.reason || edge.reason}</p></div>
      <div className="border border-blue-200 bg-blue-50 rounded-sm p-3"><div className="font-mono text-[10px] uppercase tracking-wider text-blue-800 mb-1">Recommendation</div><p className="text-xs font-mono text-blue-900">{d?.recommendation || edge.recommendation}</p></div>
    </div>}
  </div>;
}

function Info({ label, value }) {
  return <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 font-mono text-xs"><span className="text-slate-500 uppercase tracking-wider">{label}</span><span className="text-right font-bold text-slate-900">{value ?? "-"}</span></div>;
}

function Action({ label, onClick, wide }) {
  return <button onClick={onClick} className={`${wide ? "col-span-2" : ""} border border-slate-300 hover:bg-slate-50 rounded-sm px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-700`}>{label}</button>;
}

function PatternCard({ pattern }) {
  return <div className="border border-slate-200 rounded-sm p-3 bg-slate-50/70"><div className="flex items-center justify-between gap-3"><h4 className="font-display font-bold text-slate-900">{pattern.pattern}</h4><RiskBadge level={pattern.risk_level} /></div><div className="grid grid-cols-2 gap-2 mt-2 font-mono text-xs"><span className="text-slate-500">Amount</span><strong className="text-right">{money(pattern.total_amount)}</strong><span className="text-slate-500">Transactions</span><strong className="text-right">{pattern.transaction_count}</strong></div><p className="text-xs font-mono text-slate-700 mt-2">{pattern.explanation}</p><p className="text-xs font-mono text-blue-800 mt-2">{pattern.recommended_action}</p><div className="flex flex-wrap gap-1 mt-2">{pattern.accounts_involved.map((a) => <span key={a} className="border border-slate-200 bg-white px-1.5 py-0.5 rounded-sm font-mono text-[10px] text-slate-600">{a}</span>)}</div></div>;
}

function TimelineRow({ item }) {
  return <div className="border border-slate-200 rounded-sm p-3 hover:bg-slate-50"><div className="flex items-center justify-between gap-3"><div className="font-mono text-xs text-slate-500">{fmtDate(item.timestamp)}</div><RiskBadge level={item.risk_level} /></div><div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-2 items-center mt-2 font-mono text-xs"><span className="font-bold text-slate-900">{item.sender}</span><span className="text-slate-400">-></span><span className="font-bold text-slate-900">{item.receiver}</span><span className="font-bold text-slate-900">{money(item.amount)}</span></div><div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-2">{item.institution} - {item.channel}</div><p className="font-mono text-xs text-slate-700 mt-1">{item.reason}</p></div>;
}