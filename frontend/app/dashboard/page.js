'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useUser, can } from '@/lib/useUser';
import PeriodPicker, { DEFAULT_PERIOD, periodQuery, periodRange } from '@/components/PeriodPicker';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// Validated pair (blue = sales, teal = profit) — see dataviz palette check
const SALES = '#2563eb';
const PROFIT = '#0d9488';
const DEBTS = '#d97706'; // debt payments received (validated with the pair above)

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const shortMoney = (n) => {
  const v = Math.abs(n);
  if (v >= 1e6) return `${(n / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
};

const PERIOD_KEY = 'dashboard-period';

export default function Dashboard() {
  const user = useUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [missedCashUps, setMissedCashUps] = useState([]);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);

  // Remember the period this viewer last picked
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PERIOD_KEY) || 'null');
      if (saved?.key) setPeriod({ ...DEFAULT_PERIOD, ...saved });
    } catch { /* storage unavailable: keep the default */ }
  }, []);
  const choosePeriod = (p) => {
    setPeriod(p);
    try { localStorage.setItem(PERIOD_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  };

  const range = periodRange(period);
  const rangeKey = range ? `${range.start}|${range.end}` : '';
  useEffect(() => {
    if (!range) return; // e.g. custom dates not filled in yet
    setLoading(true);
    api.get(`/reports/dashboard/?${periodQuery(period)}`)
      .then((r) => { setData(r.data); setError(''); })
      .catch(() => setError('Could not load dashboard data.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const cashesUp = can.cashUp(user);
  useEffect(() => {
    if (!cashesUp) return;
    api.get('/cashup/missed/').then((r) => setMissedCashUps(r.data.days)).catch(() => {});
  }, [cashesUp]);

  const currency = data?.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);
  const sel = data?.selected;
  const label = range?.label || 'today';
  const Label = label.charAt(0).toUpperCase() + label.slice(1);

  const byMonth = sel?.trend?.unit === 'month';
  const points = sel?.trend?.points || [];
  const trend = points.map((d) => ({
    ...d,
    label: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, byMonth
      ? { month: 'short', year: '2-digit' }
      : points.length <= 14 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' }),
  }));
  const margin = sel?.sales.total ? Math.round((sel.sales.profit / sel.sales.total) * 100) : null;

  return (
    <ProtectedRoute>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {missedCashUps.length > 0 && (
        <Link href="/cashup"
          className="mb-4 flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900 hover:bg-amber-100">
          <span>
            <b>{missedCashUps.length === 1 ? '1 day was' : `${missedCashUps.length} days were`} not cashed up:</b>{' '}
            {missedCashUps.map((d) => new Date(`${d}T00:00:00`)
              .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })).join(', ')}
          </span>
          <span className="font-semibold whitespace-nowrap">Open cash-up →</span>
        </Link>
      )}

      {/* Period: every figure below follows it, except current balances */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={choosePeriod} />
        {loading && data && <span className="text-xs text-slate-400">Updating…</span>}
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl mb-6 p-6 md:p-8 text-white"
        style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #0d9488 100%)' }}>
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10" />
        <div className="absolute right-24 -bottom-20 w-48 h-48 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-blue-100">
              {greeting()}{user?.username ? `, ${user.username}` : ''} ·{' '}
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">
              {data?.business_name || 'Dashboard'}
            </h1>
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-blue-100 font-semibold">Sales · {label}</p>
              {sel ? (
                <p className="text-4xl md:text-5xl font-bold mt-1 tabular-nums">{money(sel.sales.total)}</p>
              ) : (
                <div className="h-12 w-64 bg-white/20 rounded-lg mt-1 animate-pulse" />
              )}
              {sel && (
                <p className="text-sm text-blue-100 mt-2">
                  {sel.sales.count} sale{sel.sales.count !== 1 && 's'} ·{' '}
                  <span className="text-white font-semibold">{money(sel.sales.profit)}</span> profit ·{' '}
                  <span className="text-white font-semibold">{money(sel.debt_payments.total)}</span> debts paid
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/sales" className="btn" style={{ background: '#fff', color: '#1d4ed8' }}>+ New Sale</Link>
            {can.viewSuppliers(user) && (
              <Link href="/purchases" className="btn"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}>+ Purchase</Link>
            )}
          </div>
        </div>
      </div>

      {!sel && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-32 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {sel && (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* KPI tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi icon="🧾" tint="bg-amber-50" label="Debts paid" value={money(sel.debt_payments.total)}
              hint={`${sel.debt_payments.count} payment${sel.debt_payments.count !== 1 ? 's' : ''}${
                sel.sales.total ? ` · ${Math.round((sel.debt_payments.total / sel.sales.total) * 100)}% of sales` : ''}`} />
            <Kpi icon="📈" tint="bg-teal-50" label="Gross profit" value={money(sel.sales.profit)}
              hint={margin === null ? 'No sales' : `${margin}% margin`} />
            <Kpi icon="💼" tint={sel.net_profit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
              label="Net profit" value={money(sel.net_profit)}
              valueClass={sel.net_profit < 0 ? 'text-red-600' : ''}
              hint="After expenses & returns" />
            <Kpi icon="📦" tint="bg-blue-50" label="Stock value" value={money(data.stock_value)}
              hint={`${money(sel.purchases)} bought ${label}`} />
          </div>

          {/* Money in, and how much of the profit is actually in hand */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <p className="card-title mb-0">Sales vs debt payments received</p>
                {can.recordPayment(user) && (
                  <Link href="/debts" className="text-sm text-blue-600 hover:underline">Debts →</Link>
                )}
              </div>
              <Compare label={Label} money={money} sales={sel.sales.total}
                debts={sel.debt_payments.total} debtCount={sel.debt_payments.count} />
            </div>
            <div className="card">
              <p className="card-title mb-1">Profit in hand vs profit still in debts</p>
              <p className="text-xs text-slate-500 mb-3">
                Credit sales count as profit straight away, but you only have that money once the customer pays.
              </p>
              <ProfitSplit label={Label} split={sel.collection} money={money}
                netReceived={sel.collection.profit_collected - sel.expenses - sel.returns_profit_lost} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Chart for the period */}
            <div className="card lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <p className="card-title mb-1">{Label}{byMonth ? ' · by month' : ''}</p>
                  <p className="text-sm text-slate-500">
                    <b className="text-slate-900">{money(sel.sales.total)}</b> sales ·{' '}
                    <b className="text-slate-900">{money(sel.sales.profit)}</b> profit ·{' '}
                    <b className="text-slate-900">{money(sel.debt_payments.total)}</b> debts paid
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600">
                  <Legend color={SALES} label="Sales" />
                  <Legend color={PROFIT} label="Profit" />
                  <Legend color={DEBTS} label="Debts paid" />
                </div>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={trend} barGap={2} barCategoryGap="25%">
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                      minTickGap={8} />
                    <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<ChartTooltip money={money} />} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="total" name="Sales" fill={SALES} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    <Bar dataKey="profit" name="Profit" fill={PROFIT} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    <Bar dataKey="debt_payments" name="Debts paid" fill={DEBTS} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Money owed (current balances, whatever the period) */}
            <div className="card flex flex-col gap-3">
              <p className="card-title mb-0">Money owed now</p>
              <OwedCard href="/debts" tone="amber" label="Customers owe you"
                value={money(data.receivables)} count={data.receivables_count} />
              <OwedCard href="/debts" tone="red" label="You owe suppliers"
                value={money(data.payables)} count={data.payables_count} />
              <div className="mt-auto pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{Label}</p>
                <Line label="Gross profit" value={money(sel.sales.profit)} />
                <Line label="Expenses" value={`− ${money(sel.expenses)}`} muted />
                <Line label="Profit lost on returns" value={`− ${money(sel.returns_profit_lost)}`} muted />
                <Line label="Net profit" value={money(sel.net_profit)} strong danger={sel.net_profit < 0} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Low stock */}
            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <p className="card-title mb-0">Low stock</p>
                <Link href="/inventory" className="text-sm text-blue-600 hover:underline">Inventory →</Link>
              </div>
              {data.low_stock_items?.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.low_stock_items.map((p) => {
                    const pct = Math.min(100, (p.quantity / Math.max(p.reorder_level, 1)) * 100);
                    return (
                      <li key={p.id} className="py-2.5 flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                        </div>
                        <div className="w-28 hidden sm:block">
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${p.quantity <= 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                              style={{ width: `${Math.max(pct, 4)}%` }} />
                          </div>
                        </div>
                        <p className="text-sm w-24 text-right">
                          <b className={p.quantity <= 0 ? 'text-red-600' : 'text-amber-700'}>{p.quantity}</b>
                          <span className="text-slate-400"> / {p.reorder_level}</span>
                        </p>
                      </li>
                    );
                  })}
                  {data.low_stock > data.low_stock_items.length && (
                    <li className="pt-2.5 text-sm text-slate-500">
                      + {data.low_stock - data.low_stock_items.length} more on the Inventory page
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 py-6 text-center">✅ Everything is above its reorder level.</p>
              )}
            </div>

            {/* Quick actions */}
            <div className="card">
              <p className="card-title">Quick actions</p>
              <div className="grid grid-cols-2 gap-3">
                <QuickLink href="/sales" icon="💰" label="Record sale" />
                {can.viewSuppliers(user) && <QuickLink href="/purchases" icon="🛒" label="Add purchase" />}
                {can.recordPayment(user) && <QuickLink href="/debts" icon="🧾" label="Debts" />}
                <QuickLink href="/inventory" icon="📦" label="Stock" />
                {can.viewExpenses(user) && <QuickLink href="/expenses" icon="💸" label="Expense" />}
                {can.viewExpenses(user) && <QuickLink href="/reports" icon="📊" label="Reports" />}
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

function Kpi({ icon, tint, label, value, hint, valueClass = '' }) {
  return (
    <div className="card flex items-start gap-3">
      <div className={`w-10 h-10 shrink-0 rounded-xl ${tint} flex items-center justify-center text-lg`}>{icon}</div>
      <div className="min-w-0">
        <p className="stat-label">{label}</p>
        <p className={`text-xl font-bold text-slate-900 mt-1 tabular-nums truncate ${valueClass}`}>{value}</p>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function ProfitSplit({ label, split, money, netReceived }) {
  if (!split) return null;
  const inHandPct = split.profit > 0 ? (split.profit_collected / split.profit) * 100 : 0;
  const owedPct = split.profit > 0 ? Math.round((split.profit_in_debts / split.profit) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</p>
      <Line label="Profit made" value={money(split.profit)} />
      <div className="flex justify-between py-1 text-sm">
        <span className="flex items-center gap-1.5 text-slate-700">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PROFIT }} />Received (in hand)
        </span>
        <b className="tabular-nums text-slate-900">{money(split.profit_collected)}</b>
      </div>
      <div className="flex justify-between py-1 text-sm">
        <span className="flex items-center gap-1.5 text-slate-700">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DEBTS }} />Still in debts
        </span>
        <b className="tabular-nums text-slate-900">{money(split.profit_in_debts)}</b>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mt-2 gap-0.5"
        title={`Received ${money(split.profit_collected)} · Still in debts ${money(split.profit_in_debts)}`}>
        {split.profit_collected > 0 && <div style={{ width: `${inHandPct}%`, background: PROFIT }} />}
        {split.profit_in_debts > 0 && <div style={{ width: `${100 - inHandPct}%`, background: DEBTS }} />}
      </div>
      <p className="text-xs text-slate-500 mt-2">
        {split.profit > 0 ? `${owedPct}% of the profit is not yet paid` : 'No profit yet'}
        {split.still_owed > 0 ? ` · ${money(split.still_owed)} of these sales still owed` : ''}
      </p>
      {netReceived !== undefined && (
        <Line label="Net profit received (after expenses & returns)" value={money(netReceived)} strong
          danger={netReceived < 0} />
      )}
    </div>
  );
}

function Compare({ label, sales, debts, debtCount, money }) {
  const total = sales + debts;
  const salesPct = total ? (sales / total) * 100 : 0;
  const ratio = sales ? Math.round((debts / sales) * 100) : null;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</p>
      <div className="flex justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SALES }} />Sales
        </span>
        <b className="tabular-nums text-slate-900">{money(sales)}</b>
      </div>
      <div className="flex justify-between gap-3 text-sm mt-1">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DEBTS }} />Debts paid
        </span>
        <b className="tabular-nums text-slate-900">{money(debts)}</b>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mt-3 gap-0.5"
        title={`Sales ${money(sales)} · Debts paid ${money(debts)}`}>
        {sales > 0 && <div style={{ width: `${salesPct}%`, background: SALES }} />}
        {debts > 0 && <div style={{ width: `${100 - salesPct}%`, background: DEBTS }} />}
      </div>
      <p className="text-xs text-slate-500 mt-2">
        {ratio === null
          ? (debts ? 'No sales yet — all money in came from debts' : 'Nothing yet')
          : `Debts paid = ${ratio}% of sales`}
        {debtCount ? ` · ${debtCount} payment${debtCount !== 1 ? 's' : ''}` : ''}
      </p>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function ChartTooltip({ active, payload, label, money }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <b className="text-slate-900">{money(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

function OwedCard({ href, tone, label, value, count }) {
  const tones = {
    amber: 'bg-amber-50 border-amber-200 hover:border-amber-300',
    red: 'bg-red-50 border-red-200 hover:border-red-300',
  };
  return (
    <Link href={href} className={`block rounded-xl border p-4 transition-colors ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{count} open debt{count !== 1 && 's'} →</p>
    </Link>
  );
}

function Line({ label, value, muted, strong, danger }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${strong ? 'border-t border-slate-100 mt-1 pt-2' : ''}`}>
      <span className={muted ? 'text-slate-500' : 'text-slate-700'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${danger ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  );
}

function QuickLink({ href, icon, label }) {
  return (
    <Link href={href}
      className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group">
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium text-slate-700 group-hover:text-blue-700">{label}</span>
    </Link>
  );
}
