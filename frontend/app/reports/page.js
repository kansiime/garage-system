'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { downloadFile } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import PeriodPicker, { DEFAULT_PERIOD, periodQuery, periodRange } from '@/components/PeriodPicker';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

// Same validated pair as the dashboard: blue = sales, amber = debts paid
const SALES_COLOR = '#2563eb';
const DEBTS_COLOR = '#d97706';
const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899'];

export default function ReportsPage() {
  const [period, setPeriod] = useState({ ...DEFAULT_PERIOD, key: 'month' });
  const range = periodRange(period);
  const rangeKey = range ? `${range.start}|${range.end}` : '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadError, setDownloadError] = useState('');

  // Build query string for downloads using `output=` (not `format=`)
  const buildQuery = (fmt) => {
    return `${periodQuery(period)}&output=${fmt}`;
  };

  const load = () => {
    if (!range) return; // custom dates not filled in yet
    setLoading(true);
    api.get(`/reports/overview/?${periodQuery(period)}`)
      .then((r) => setData(r.data))
      .catch(() => setDownloadError('Could not load report data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [rangeKey]);

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
      <div className="mb-6">
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {loading && <p className="text-slate-500 text-sm mb-4">Loading report…</p>}

      {data && (
        <>
          {/* KPIs, grouped into three compact panels */}
          {(() => {
            const k = data.kpis;
            const debtsPaid = k.debt_payments_received || 0;
            const debtShare = k.total_sales ? `${Math.round((debtsPaid / k.total_sales) * 100)}% of sales · ` : '';
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <MetricGroup title="Sales & money in">
                  <Metric label="Total sales" value={money(k.total_sales)} dot="#2563eb"
                    hint={`${k.transaction_count} sales · avg ${money(k.average_sale)}`} />
                  <Metric label="Debts paid" value={money(debtsPaid)} dot="#d97706"
                    hint={`${debtShare}${k.debt_payments_count || 0} payments`} />
                  <Metric label="Purchases" value={money(k.total_purchases)} />
                  <Metric label="Expenses" value={money(k.total_expenses || 0)} />
                </MetricGroup>

                <MetricGroup title="Profit">
                  <Metric label="Gross profit" value={money(k.gross_profit || k.total_profit)}
                    hint={`${k.gross_margin}% margin`} />
                  <Metric label="Lost on returns" value={money(k.returns_profit_lost || 0)}
                    hint={`${money(k.total_returns || 0)} returned`} />
                  <Metric label="Net profit" value={money(k.net_profit || 0)} span
                    negative={(k.net_profit || 0) < 0}
                    hint={`${k.net_margin || 0}% net margin · after expenses & returns`} />
                </MetricGroup>

                <MetricGroup title="Money in hand & balances">
                  <Metric label="Profit received" value={money(k.profit_collected || 0)} dot="#0d9488"
                    hint={`${money(k.sales_collected || 0)} of sales paid`} />
                  <Metric label="Profit in debts" value={money(k.profit_in_debts || 0)} dot="#d97706"
                    hint={`${money(k.sales_still_owed || 0)} of sales unpaid`} />
                  <Metric label="Net profit received" value={money(k.net_profit_received || 0)} span
                    negative={(k.net_profit_received || 0) < 0}
                    hint="Profit actually paid, after expenses & returns" />
                  <Metric label="Customers owe" value={money(k.receivables)} />
                  <Metric label="You owe suppliers" value={money(k.payables)} />
                  <Metric label="Stock value" value={money(k.stock_value)} span />
                </MetricGroup>
              </div>
            );
          })()}

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

          {data.daily_money_in?.length > 0 && (
            <DailyMoneyIn days={data.daily_money_in} money={money} />
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
            { key: 'money-in', label: 'Sales vs Debts Paid by Day' },
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

function DailyMoneyIn({ days, money }) {
  const totals = days.reduce((t, d) => ({
    sales: t.sales + d.sales,
    debts: t.debts + d.debt_payments,
    count: t.count + d.debt_payments_count,
  }), { sales: 0, debts: 0, count: 0 });
  const label = (iso) => new Date(`${iso}T00:00:00`)
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const chartData = days.map((d) => ({ ...d, label: label(d.date) }));
  const pct = (d) => (d.sales ? `${Math.round((d.debt_payments / d.sales) * 100)}%` : '—');

  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="card-title mb-1">Sales vs debts paid by day</p>
          <p className="text-sm text-slate-500">
            <b className="text-slate-900">{money(totals.sales)}</b> sales ·{' '}
            <b className="text-slate-900">{money(totals.debts)}</b> debts paid
            {' '}({totals.count} payment{totals.count !== 1 && 's'})
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SALES_COLOR }} />Sales
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DEBTS_COLOR }} />Debts paid
          </span>
        </div>
      </div>

      {days.length > 1 && (
        <div style={{ width: '100%', height: 260 }} className="mb-4">
          <ResponsiveContainer>
            <BarChart data={chartData} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                minTickGap={12} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="sales" name="Sales" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24}
                isAnimationActive={false} />
              <Bar dataKey="debt_payments" name="Debts paid" fill={DEBTS_COLOR} radius={[4, 4, 0, 0]}
                maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-auto max-h-96 border border-slate-100 rounded-lg">
        <table>
          <thead className="sticky top-0 bg-white">
            <tr>
              <th>Date</th>
              <th className="text-right">Sales</th>
              <th className="text-right">Debts paid</th>
              <th className="text-right">Payments</th>
              <th className="text-right">Debts paid vs sales</th>
              <th className="text-right">Total money in</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.date} className={!d.sales && !d.debt_payments ? 'text-slate-400' : ''}>
                <td className="whitespace-nowrap">{label(d.date)}</td>
                <td className="text-right tabular-nums">{money(d.sales)}</td>
                <td className="text-right tabular-nums">{money(d.debt_payments)}</td>
                <td className="text-right tabular-nums">{d.debt_payments_count}</td>
                <td className="text-right tabular-nums">{pct(d)}</td>
                <td className="text-right tabular-nums font-semibold">{money(d.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t border-slate-200">
              <td>Total</td>
              <td className="text-right tabular-nums">{money(totals.sales)}</td>
              <td className="text-right tabular-nums">{money(totals.debts)}</td>
              <td className="text-right tabular-nums">{totals.count}</td>
              <td className="text-right tabular-nums">{pct({ sales: totals.sales, debt_payments: totals.debts })}</td>
              <td className="text-right tabular-nums">{money(totals.sales + totals.debts)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function MetricGroup({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

function Metric({ label, value, hint, dot, span, negative }) {
  return (
    <div className={`min-w-0 ${span ? 'col-span-2 pt-3 border-t border-slate-100' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />}
        {label}
      </p>
      <p className={`mt-0.5 font-semibold tabular-nums truncate ${span ? 'text-lg' : 'text-base'} ${negative ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{hint}</p>}
    </div>
  );
}
