'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useUser, can } from '@/lib/useUser';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// Validated pair (blue = sales, teal = profit) — see dataviz palette check
const SALES = '#2563eb';
const PROFIT = '#0d9488';

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

export default function Dashboard() {
  const user = useUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [missedCashUps, setMissedCashUps] = useState([]);

  useEffect(() => {
    api.get('/reports/dashboard/')
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load dashboard data.'));
  }, []);

  const cashesUp = can.cashUp(user);
  useEffect(() => {
    if (!cashesUp) return;
    api.get('/cashup/missed/').then((r) => setMissedCashUps(r.data.days)).catch(() => {});
  }, [cashesUp]);

  const currency = data?.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);

  const trend = (data?.trend || []).map((d) => ({
    ...d,
    label: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
  }));
  const weekSales = trend.reduce((s, d) => s + d.total, 0);
  const weekProfit = trend.reduce((s, d) => s + d.profit, 0);

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
              <p className="text-xs uppercase tracking-wider text-blue-100 font-semibold">Today&apos;s sales</p>
              {data ? (
                <p className="text-4xl md:text-5xl font-bold mt-1 tabular-nums">{money(data.today.total)}</p>
              ) : (
                <div className="h-12 w-64 bg-white/20 rounded-lg mt-1 animate-pulse" />
              )}
              {data && (
                <p className="text-sm text-blue-100 mt-2">
                  {data.today.count} sale{data.today.count !== 1 && 's'} ·{' '}
                  <span className="text-white font-semibold">{money(data.today.profit)}</span> profit
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

      {!data && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-32 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi icon="📅" tint="bg-blue-50" label="Sales this month" value={money(data.month.total)}
              hint={`${data.month.count} sales`} />
            <Kpi icon="📈" tint="bg-teal-50" label="Gross profit this month" value={money(data.month.profit)}
              hint={data.month.total ? `${Math.round((data.month.profit / data.month.total) * 100)}% margin` : 'No sales yet'} />
            <Kpi icon="💼" tint={data.net_profit_month >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
              label="Net profit this month" value={money(data.net_profit_month)}
              valueClass={data.net_profit_month < 0 ? 'text-red-600' : ''}
              hint="After expenses & returns" />
            <Kpi icon="📦" tint="bg-amber-50" label="Stock value" value={money(data.stock_value)}
              hint={`${money(data.purchases_month)} bought this month`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* 7-day chart */}
            <div className="card lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <p className="card-title mb-1">Last 7 days</p>
                  <p className="text-sm text-slate-500">
                    <b className="text-slate-900">{money(weekSales)}</b> sales ·{' '}
                    <b className="text-slate-900">{money(weekProfit)}</b> profit
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600">
                  <Legend color={SALES} label="Sales" />
                  <Legend color={PROFIT} label="Profit" />
                </div>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={trend} barGap={2} barCategoryGap="25%">
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<ChartTooltip money={money} />} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="total" name="Sales" fill={SALES} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    <Bar dataKey="profit" name="Profit" fill={PROFIT} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Money owed */}
            <div className="card flex flex-col gap-3">
              <p className="card-title mb-0">Money owed</p>
              <OwedCard href="/debts" tone="amber" label="Customers owe you"
                value={money(data.receivables)} count={data.receivables_count} />
              <OwedCard href="/debts" tone="red" label="You owe suppliers"
                value={money(data.payables)} count={data.payables_count} />
              <div className="mt-auto pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">This month</p>
                <Line label="Gross profit" value={money(data.month.profit)} />
                <Line label="Expenses" value={`− ${money(data.expenses_month)}`} muted />
                <Line label="Returns" value={`− ${money(data.returns_month?.total || 0)}`} muted />
                <Line label="Net profit" value={money(data.net_profit_month)} strong
                  danger={data.net_profit_month < 0} />
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
        </>
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
