import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";
import RiskBadge from "../components/RiskBadge";
import {
  ArrowClockwise,
  ArrowRight,
  Bank,
  CheckCircle,
  Info,
  Lightning,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const INSTITUTIONS = [
  "EcoCash",
  "InnBucks",
  "OneMoney",
  "CBZ Bank",
  "ZB Bank",
  "FBC Bank",
  "Stanbic Bank",
  "Nedbank ZW",
  "Steward Bank",
];

const MOBILE_MONEY = new Set(["EcoCash", "InnBucks", "OneMoney"]);
const CURRENCIES = ["USD", "ZWL", "ZiG"];

const initialForm = {
  sender_institution: "CBZ Bank",
  sender_account: "CBZ-48291736",
  sender_name: "Tendai Moyo",
  receiver_institution: "FBC Bank",
  receiver_account: "FBC-73920418",
  receiver_name: "Ruvimbo Dube",
  amount: "1250",
  currency: "USD",
  description: "Invoice payment for office supplies",
};

const scenarios = [
  {
    label: "Normal salary payment",
    values: {
      sender_institution: "Stanbic Bank",
      sender_account: "STA-10482937",
      sender_name: "Harare Manufacturing Ltd",
      receiver_institution: "CBZ Bank",
      receiver_account: "CBZ-63820194",
      receiver_name: "Nyasha Mhlanga",
      amount: "1850",
      description: "Monthly salary payment May payroll",
    },
  },
  {
    label: "School fees payment",
    values: {
      sender_institution: "FBC Bank",
      sender_account: "FBC-58392017",
      sender_name: "Chiedza Ncube",
      receiver_institution: "ZB Bank",
      receiver_account: "ZBB-94017362",
      receiver_name: "St Marys College",
      amount: "720",
      description: "School fees term 2 payment",
    },
  },
  {
    label: "Grocery payment",
    values: {
      sender_institution: "EcoCash",
      sender_account: "+263771482935",
      sender_name: "Farai Sibanda",
      receiver_institution: "EcoCash",
      receiver_account: "+263772918406",
      receiver_name: "TM Pick n Pay Borrowdale",
      amount: "86.45",
      description: "Grocery purchase Pick n Pay",
    },
  },
  {
    label: "Structuring under threshold",
    values: {
      sender_institution: "CBZ Bank",
      sender_account: "CBZ-99881234",
      sender_name: "Kudzai Holdings",
      receiver_institution: "Nedbank ZW",
      receiver_account: "NED-44820391",
      receiver_name: "Zambezi Trading Pvt Ltd",
      amount: "9800",
      description: "Structuring settlement under threshold urgent invoice",
    },
  },
  {
    label: "Rapid split transfer",
    values: {
      sender_institution: "Steward Bank",
      sender_account: "STE-22334455",
      sender_name: "Tafadzwa Marufu",
      receiver_institution: "OneMoney",
      receiver_account: "+263713529847",
      receiver_name: "Blessing Chirwa",
      amount: "9800",
      description: "Rapid split transfer structuring under threshold settlement immediate",
    },
  },
  {
    label: "Offshore shell company payment",
    values: {
      sender_institution: "ZB Bank",
      sender_account: "ZBB-77219044",
      sender_name: "Matobo Minerals",
      receiver_institution: "Stanbic Bank",
      receiver_account: "STA-62019483",
      receiver_name: "Blue Harbor Shell Services",
      amount: "10000",
      description: "Offshore shell company invoice consultancy fee urgent",
    },
  },
  {
    label: "Crypto settlement",
    values: {
      sender_institution: "Nedbank ZW",
      sender_account: "NED-55049281",
      sender_name: "Anesu Zhou",
      receiver_institution: "InnBucks",
      receiver_account: "+263785310982",
      receiver_name: "Digital Asset Broker",
      amount: "50000",
      description: "Crypto trade urgent settlement no questions",
    },
  },
  {
    label: "Cross-channel transfer",
    values: {
      sender_institution: "EcoCash",
      sender_account: "+263777203948",
      sender_name: "Rumbi Madondo",
      receiver_institution: "FBC Bank",
      receiver_account: "FBC-83175920",
      receiver_name: "Tinashe Investments",
      amount: "9300",
      description: "Cross-channel transfer under threshold business settlement",
    },
  },
];

function channelFor(sender, receiver) {
  return MOBILE_MONEY.has(sender) || MOBILE_MONEY.has(receiver) ? "mobile_money" : "bank";
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export default function Simulator() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const nav = useNavigate();

  const channel = useMemo(
    () => channelFor(form.sender_institution, form.receiver_institution),
    [form.sender_institution, form.receiver_institution]
  );

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const applyScenario = (scenario) => {
    setResult(null);
    setForm((prev) => ({ ...prev, ...scenario.values, currency: "USD" }));
  };

  const resetForm = () => {
    setResult(null);
    setForm(initialForm);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!CURRENCIES.includes(form.currency)) {
      toast.error("Invalid currency", { description: "Choose a currency from the list." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const payload = { ...form, amount: Number(form.amount), currency: form.currency };
      const { data } = await apiClient.post("/simulator/transactions", payload);
      setResult(data);
      const tx = data.transaction;
      toast.success("Transaction simulated", {
        description: `Risk ${Number(tx.risk_score).toFixed(2)} - ${tx.risk_level.toUpperCase()}`,
      });
    } catch (err) {
      const message = err.response?.data?.detail || "Unable to simulate transaction.";
      toast.error("Simulation failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full border border-slate-300 rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800";
  const tx = result?.transaction;
  const reasons = result?.explanation?.reasons || [];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto" data-testid="simulator-page">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-1">Demo Tool</p>
          <h1 className="font-display font-black text-3xl tracking-tight text-slate-900">Multi-Institution Transaction Simulator</h1>
          <p className="text-sm text-slate-600 mt-1">Generate demo bank and mobile-money transactions to test AML detection.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 border border-blue-200 bg-blue-50 text-blue-800 px-3 py-2 rounded-sm text-xs font-mono uppercase tracking-wider">
          <Lightning size={15} weight="bold" /> Admin simulation
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-5 mb-5">
        <div className="flex items-start gap-3">
          <Info size={22} weight="duotone" className="text-blue-800 mt-0.5" />
          <div>
            <h2 className="font-display font-bold text-slate-900">Demo Simulation Only</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-4xl">
              In production, transactions would come from secure APIs connected to banks, mobile money providers, and payment switches.
              This simulator is used only because live financial integrations are unavailable in the academic prototype.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-white border border-slate-200 rounded-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display font-bold text-slate-900">Quick Scenarios</h2>
                <p className="text-xs text-slate-500 mt-1">Use prebuilt patterns to demonstrate normal and suspicious monitoring outcomes.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.label}
                  type="button"
                  onClick={() => applyScenario(scenario)}
                  className="text-left border border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-sm p-3 text-xs font-semibold text-slate-700 transition-colors min-h-[70px]"
                >
                  {scenario.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="bg-white border border-slate-200 rounded-sm p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display font-bold text-slate-900">Transaction Form</h2>
                <p className="text-xs text-slate-500 mt-1">Submitted transactions are stored in the live admin ledger and scored immediately.</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-sm">
                <Bank size={13} weight="bold" /> {channel.replace("_", " ")}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Sender institution">
                <select value={form.sender_institution} onChange={(e) => update("sender_institution", e.target.value)} className={inputClass}>
                  {INSTITUTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Receiver institution">
                <select value={form.receiver_institution} onChange={(e) => update("receiver_institution", e.target.value)} className={inputClass}>
                  {INSTITUTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Sender account number">
                <input value={form.sender_account} onChange={(e) => update("sender_account", e.target.value)} className={inputClass} required />
              </Field>
              <Field label="Receiver account number">
                <input value={form.receiver_account} onChange={(e) => update("receiver_account", e.target.value)} className={inputClass} required />
              </Field>
              <Field label="Sender name">
                <input value={form.sender_name} onChange={(e) => update("sender_name", e.target.value)} className={inputClass} required />
              </Field>
              <Field label="Receiver name">
                <input value={form.receiver_name} onChange={(e) => update("receiver_name", e.target.value)} className={inputClass} required />
              </Field>
              <Field label="Amount">
                <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} className={inputClass} required />
              </Field>
              <Field label="Currency">
                <select value={form.currency} onChange={(e) => update("currency", e.target.value)} className={inputClass} required>
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Transaction description">
                  <textarea
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    className={`${inputClass} min-h-[92px] resize-y`}
                    required
                  />
                </Field>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white px-4 py-2.5 rounded-sm text-sm font-semibold transition-colors"
              >
                {submitting ? <ArrowClockwise size={16} weight="bold" className="animate-spin" /> : <Lightning size={16} weight="bold" />}
                {submitting ? "Scoring transaction..." : "Submit Simulation"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-sm text-sm font-semibold transition-colors"
              >
                <ArrowClockwise size={16} weight="bold" /> Reset
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-sm p-5">
            <h2 className="font-display font-bold text-slate-900 mb-3">Simulation Result</h2>
            {!tx && (
              <div className="border border-dashed border-slate-300 bg-slate-50 rounded-sm p-5 text-sm text-slate-500">
                Submit a transaction to see risk score, risk level, flagged status, and AML reasons.
              </div>
            )}
            {tx && (
              <div className="space-y-4" data-testid="simulator-result">
                <div className={`border rounded-sm p-4 ${tx.flagged ? "border-rose-300 bg-rose-50" : "border-emerald-300 bg-emerald-50"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-display font-bold text-slate-900">
                      {tx.flagged ? <WarningCircle size={22} weight="duotone" className="text-rose-700" /> : <CheckCircle size={22} weight="duotone" className="text-emerald-700" />}
                      {tx.flagged ? "Flagged for review" : "No review flag"}
                    </div>
                    <RiskBadge level={tx.risk_level} />
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    {tx.flagged ? "The detection engine found signals that require compliance review." : "The transaction was scored and stored with no current alert trigger."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-slate-200 rounded-sm p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Risk Score</div>
                    <div className="font-display font-black text-3xl text-slate-900">{Number(tx.risk_score).toFixed(2)}</div>
                  </div>
                  <div className="border border-slate-200 rounded-sm p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Flagged</div>
                    <div className="font-display font-black text-3xl text-slate-900">{tx.flagged ? "Yes" : "No"}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">AML Reasons</div>
                  <div className="space-y-2">
                    {reasons.map((reason, index) => (
                      <div key={`${reason}-${index}`} className="text-xs font-mono text-slate-700 border border-slate-200 bg-slate-50 rounded-sm p-2">
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => nav(`/transactions?focus=${tx.id}`)}
                    className="inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-sm text-sm font-semibold transition-colors"
                  >
                    View in Transactions <ArrowRight size={15} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => nav("/alerts")}
                    className="inline-flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-sm text-sm font-semibold transition-colors"
                  >
                    View Alerts <ArrowRight size={15} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-sm text-sm font-semibold transition-colors"
                  >
                    Simulate Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
