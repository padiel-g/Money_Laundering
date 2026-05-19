import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";

const BG = "https://images.unsplash.com/photo-1662831328181-8d2df5898ad4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwxfHxoYXJhcmUlMjBza3lsaW5lfGVufDB8fHx8MTc3NzQxNTc0N3ww&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const [email, setEmail] = useState("officer@rbz.co.zw");
  const [password, setPassword] = useState("aml2026");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Authenticated", { description: "Welcome to the AML Control Room" });
      nav("/dashboard");
    } catch {
      toast.error("Authentication failed", { description: "Check credentials and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50">
      {/* Left visual */}
      <div className="hidden lg:flex relative items-end p-12 bg-cover bg-center"
           style={{ backgroundImage: `linear-gradient(180deg, rgba(0,47,167,0.55), rgba(15,23,42,0.85)), url(${BG})` }}>
        <div className="text-white max-w-md">
          <div className="text-xs font-mono uppercase tracking-[0.3em] mb-3 text-blue-200">Reserve Bank of Zimbabwe</div>
          <h1 className="font-display font-black text-5xl leading-tight mb-4">
            Anti-Money Laundering Control Room
          </h1>
          <p className="text-base text-blue-100 leading-relaxed">
            Real-time detection of layering schemes across Zimbabwe&apos;s banking and mobile money corridors.
            Powered by sequence modelling, NLP and graph analytics.
          </p>
          <div className="mt-8 flex gap-6 font-mono text-xs uppercase tracking-wider text-blue-200">
            <div><div className="text-2xl font-display font-black text-white">3</div>Detection layers</div>
            <div><div className="text-2xl font-display font-black text-white">7+</div>FIs monitored</div>
            <div><div className="text-2xl font-display font-black text-white">24/7</div>Real-time</div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} data-testid="login-form" className="w-full max-w-sm bg-white border border-slate-200 rounded-sm p-8">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={28} weight="duotone" className="text-blue-800" />
            <span className="font-display font-black tracking-tight text-xl text-slate-900">AML/ZW</span>
          </div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500 mb-6">Compliance Officer Login</p>

          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Email</label>
          <input
            data-testid="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-sm px-3 py-2 mb-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800"
            required
          />

          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">Password</label>
          <input
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-sm px-3 py-2 mb-6 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800"
            required
          />

          <button
            data-testid="login-submit-button"
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white font-semibold py-2.5 rounded-sm transition-colors"
          >
            {busy ? "Authenticating..." : "Access dashboard"} <ArrowRight size={16} weight="bold" />
          </button>

          <div className="mt-6 p-3 bg-slate-50 border border-slate-200 rounded-sm text-xs text-slate-600 font-mono">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Demo credentials</div>
            officer@rbz.co.zw / aml2026
          </div>
        </form>
      </div>
    </div>
  );
}
