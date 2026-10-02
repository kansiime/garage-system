'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { downloadFile } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899'];

export default function ReportsPage() {
  const [period, setPeriod] = useState('month');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadError, setDownloadError] = useState('');

  // Build query string for downloads using `output=` (not `format=`)
  const buildQuery = (fmt) => {
    const p = new URLSearchParams({ period, output: fmt });
    if (period === 'custom') { p.set('start', start); p.set('end', end); }
    return p.toString();
  };

  const load = () => {
    setLoading(true);
    const q = new URLSearchParams({ period });
    if (period === 'custom') { q.set('start', start); q.set('end', end); }
    api.get(`/reports/overview/?${q.toString()}`)
      .then((r) => setData(r.data))
      .catch(() => setDownloadError('Could not load report data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, start, end]);

  const download = async (key, fmt) => {
    setDownloadError('');
    try {
      const url = `/reports/${key}/?${buildQuery(fmt)}`;
      await downloadFile(url, `${key}_report.${fmt === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      const status = err?.response?.status;
      setDownloadError(
        status
          ? `Download failed (HTTP ${status}). Check backend logs.`
          : 'Download failed. Please try again.'
      );
    }
  };

  const currency = data?.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">
          {data ? `${data.business_name} — ${data.period.start} to ${data.period.end}` : 'Performance overview'}
        </p>
      </div>

      {downloadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {downloadError}
        </div>
      )}

      {/* Period picker */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label>Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {period === 'custom' && (
            <>
              <div><label>Start</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><label>End</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </>
          )}
        </div>
      </div>

      {loading && <p className="text-slate-500 text-sm mb-4">Loading report…</p>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Sales" value={money(data.kpis.total_sales)} />
            <Kpi label="Gross Profit" value={money(data.kpis.gross_profit || data.kpis.total_profit)}
                 accent="green" hint={`${data.kpis.gross_margin}% margin`} />
            <Kpi label="Total Expenses" value={money(data.kpis.total_expenses || 0)} accent="red" />
            <Kpi label="Total Returns" value={money(data.kpis.total_returns || 0)} accent="amber" />
            <Kpi label="Net Profit" value={money(data.kpis.net_profit || 0)}
                 accent={(data.kpis.net_profit || 0) >= 0 ? 'green' : 'red'}
                 hint={`${data.kpis.net_margin || 0}% net margin`} />
            <Kpi label="Purchases" value={money(data.kpis.total_purchases)} accent="amber" />
            <Kpi label="Transactions" value={data.kpis.transaction_count} accent="purple"
                 hint={`Avg ${money(data.kpis.average_sale)}`} />
            <Kpi label="Receivables" value={money(data.kpis.receivables)} accent="amber" />
            <Kpi label="Payables" value={money(data.kpis.payables)} accent="red" />
            <Kpi label="Stock Value" value={money(data.kpis.stock_value)} />
            <Kpi label="Gross Margin" value={`${data.kpis.gross_margin}%`} accent="green" />
            <Kpi label="Net Margin" value={`${data.kpis.net_margin || 0}%`}
                 accent={(data.kpis.net_margin || 0) >= 0 ? 'green' : 'red'} />
          </div>

          {/* Cash vs Credit */}
          {data.cash_vs_credit && (
            <div className="card mb-6">
              <p className="card-title">Cash vs Credit</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-xs font-semibold text-green-800 uppercase">Cash</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">{money(data.cash_vs_credit.cash.total)}</p>
                  <p className="text-xs text-green-700 mt-1">
                    {data.cash_vs_credit.cash.count} sale{data.cash_vs_credit.cash.count !== 1 && 's'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-100">
                  <p className="text-xs font-semibold text-amber-800 uppercase">Credit</p>
                  <p className="text-2xl font-bold text-amber-900 mt-1">{money(data.cash_vs_credit.credit.total)}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    {data.cash_vs_credit.credit.count} sale{data.cash_vs_credit.credit.count !== 1 && 's'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-800 uppercase">Partial</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{money(data.cash_vs_credit.partial.total)}</p>
                  <p className="text-xs text-blue-700 mt-1">
                    {data.cash_vs_credit.partial.count} sale{data.cash_vs_credit.partial.count !== 1 && 's'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sales trend */}
          {data.sales_trend?.length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Sales Trend</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={data.sales_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {data.top_products?.length > 0 && (
              <div className="card">
                <p className="card-title">Top Products by Revenue</p>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.top_products} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="revenue" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.payment_mix?.length > 0 && (
              <div className="card">
                <p className="card-title">Payment Mix</p>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={data.payment_mix} dataKey="total" nameKey="type" outerRadius={90} label>
                        {data.payment_mix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Top customers */}
          {data.top_customers?.length > 0 && (
            <div className="table-wrap mb-6">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th><th>Phone</th>
                    <th className="text-right">Sales</th>
                    <th className="text-right">Total Spent</th>
                    <th className="text-right">Outstanding</th>
                    <th>Last Visit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_customers.map((c) => (
                    <tr key={c.name}>
                      <td className="font-medium">{c.name}</td>
                      <td className="text-sm text-slate-600">{c.phone || '—'}</td>
                      <td className="text-right">{c.count}</td>
                      <td className="text-right font-semibold">{money(c.total)}</td>
                      <td className={`text-right ${c.balance > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {c.balance > 0 ? money(c.balance) : '—'}
                      </td>
                      <td className="text-sm text-slate-500">{c.last_visit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Returns section */}
          {data.returns_by_type && (data.returns_by_type[0]?.total > 0 || data.returns_by_type[1]?.total > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="card">
                <p className="card-title">Returns by Type</p>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.returns_by_type}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="total" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {data.returns_by_product?.length > 0 && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="text-right">Qty Returned</th>
                        <th className="text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.returns_by_product.map((p) => (
                        <tr key={p.name}>
                          <td className="font-medium">{p.name}</td>
                          <td className="text-right">{p.qty}</td>
                          <td className="text-right font-semibold">{money(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Expenses by category */}
          {data.expenses_by_category?.length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Expenses by Category</p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={data.expenses_by_category} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="total" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Stock by category */}
          {data.stock_by_category?.length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Stock Value by Category</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.stock_by_category}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="value" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top products table */}
          {data.top_products?.length > 0 && (
            <div className="table-wrap mb-6">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Qty Sold</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Gross Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map((p) => (
                    <tr key={p.name}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-right">{p.qty}</td>
                      <td className="text-right">{money(p.revenue)}</td>
                      <td className="text-right text-slate-500">{money(p.cost)}</td>
                      <td className="text-right text-green-600 font-semibold">{money(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Downloads */}
      <div className="card">
        <p className="card-title">Download Reports</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { key: 'sales', label: 'Sales Report' },
            { key: 'purchases', label: 'Purchases Report' },
            { key: 'stock', label: 'Stock Report' },
            { key: 'debts', label: 'Debts Report' },
            { key: 'profit', label: 'Profit Report' },
            { key: 'expenses', label: 'Expenses Report' },
            { key: 'returns', label: 'Returns Report' },
          ].map((r) => (
            <div key={r.key} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-sm font-medium">{r.label}</span>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => download(r.key, 'pdf')}>PDF</button>
                <button className="btn btn-secondary btn-sm" onClick={() => download(r.key, 'excel')}>Excel</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function Kpi({ label, value, accent = '', hint }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}