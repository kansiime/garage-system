'use client';

/**
 * Money that actually came in for the period, less expenses paid:
 * Paid at sale + Debts paid − Expenses = Net cash.
 */
export default function CashFlow({ cash, money, label }) {
  if (!cash) return null;
  const negative = cash.net_cash < 0;
  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="card-title mb-0">Cash · {label}</p>
        <p className="text-xs text-slate-500">
          Money received (all payment methods) minus expenses paid. Credit sales count only when paid.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.2fr] items-center gap-x-3 gap-y-3">
        <Part label="Paid at sale" value={money(cash.paid_at_sale)} dot="#2563eb" />
        <Op>+</Op>
        <Part label="Debts paid" value={money(cash.debts_paid)} dot="#d97706" />
        <Op>−</Op>
        <Part label="Expenses paid" value={money(cash.expenses_paid)} dot="#94a3b8" minus />
        <Op>=</Op>
        <div className={`col-span-2 md:col-span-1 rounded-xl px-4 py-3 ${negative ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Net cash</p>
          <p className={`text-2xl font-bold tabular-nums ${negative ? 'text-red-600' : 'text-slate-900'}`}>
            {money(cash.net_cash)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Part({ label, value, dot, minus }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />{label}
      </p>
      <p className="text-lg font-semibold tabular-nums text-slate-900 truncate">
        {minus && <span className="md:hidden">− </span>}{value}
      </p>
    </div>
  );
}

function Op({ children }) {
  return <span className="hidden md:block text-xl text-slate-300 font-light text-center">{children}</span>;
}
