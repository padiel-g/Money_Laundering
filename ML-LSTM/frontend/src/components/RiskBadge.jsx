import React from "react";

const styles = {
  high: "bg-rose-100 text-rose-700 border-rose-300",
  medium: "bg-amber-100 text-amber-700 border-amber-300",
  low: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

export const RiskBadge = ({ level, children, ...props }) => {
  const cls = styles[level] || styles.low;
  return (
    <span
      data-testid={`risk-badge-${level}`}
      className={`inline-flex items-center gap-1 border ${cls} font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider`}
      {...props}
    >
      {children || level}
    </span>
  );
};

export default RiskBadge;
