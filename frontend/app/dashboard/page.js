'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/dashboard/')
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load dashboard data.'));

    // 14-day sales trend for the mini chart
    api.get('/reports/overview/?period=week')
      .then((r) => setTrend(r.data?.sales_trend || []))
      .catch(() => {});
  }, []);

  const currency = data?.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data?.business_name ? `Overview of ${data.business_name}` : 'Overview of your garage performance'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/sales" className="btn btn-primary">+ New Sale</Link>
          <Link href="/purchases" className="btn btn-secondary">+ Purchase</Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-32 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Primary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Stat label="Today's Sales" value={money(data.today.total)} hint={`${data.today.count} transactions`} />
            <Stat label="Today's Profit" value={money(data.today.profit)} accent="green" hint="Gross profit today" />
            <Stat label="Month Sales" value={money(data.month.total)} hint={`${data.month.count} transactions`} />
            <Stat label="Month Profit" value={money(data.month.profit)} accent="green" hint="Gross profit this month" />
            <Stat label="Receivables" value={money(data.receivables)} accent="amber" hint="Owed to you" />
            <Stat label="Payables" value={money(data.payables)} accent="red" hint="You owe suppliers" />
          </div>

          {/* Mini trend + snapshot row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <p className="card-title mb-0">Sales — Last 7 Days</p>
                <Link href="/reports" className="text-sm text-blue-600 hover:underline">
                  Full reports →
                </Link>
              </div>
              {trend.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                  No sales yet — data will appear here.
                </div>
              ) : (
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card">
              <p className="card-title">Operations Snapshot</p>
              <div className="space-y-3">
                <Row label="Stock Value" value={money(data.stock_value)} />
                <Row label="Low Stock" value={data.low_stock} danger={data.low_stock > 0} />
                <Row label="Purchases (Month)" value={money(data.purchases_month)} />
                <Row label="Purchases (Today)" value={money(data.purchases_today)} />
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="card mb-6">
            <p className="card-title">Quick Actions</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <QuickLink href="/sales" icon="💰" label="Record a Sale" />
              <QuickLink href="/purchases" icon="🛒" label="Add Purchase" />
              <QuickLink href="/inventory" icon="📦" label="Manage Stock" />
              <QuickLink href="/reports" icon="📈" label="View Reports" />
            </div>
          </div>

          {/* Low stock */}
          {data.low_stock_items && data.low_stock_items.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="card-title mb-0">⚠️ Low Stock Alert</p>
                <Link href="/inventory" className="text-sm text-blue-600 hover:underline">
                  Restock →
                </Link>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th><th>Product</th>
                      <th className="text-right">In Stock</th>
                      <th className="text-right">Reorder At</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.low_stock_items.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs">{p.sku}</td>
                        <td className="font-medium">{p.name}</td>
                        <td className="text-right text-red-600 font-semibold">{p.quantity}</td>
                        <td className="text-right text-slate-500">{p.reorder_level}</td>
                        <td className="text-right">
                          <Link href="/inventory" className="btn btn-secondary btn-sm">Restock</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </ProtectedRoute>
  );
}

function Stat({ label, value, accent = '', hint }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Row({ label, value, danger }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm font-semibold ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function QuickLink({ href, icon, label }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">{label}</span>
    </Link>
  );
}