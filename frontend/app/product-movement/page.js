'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { downloadFile } from '@/lib/api';
import { formatMoney } from '@/lib/format';

export default function ProductMovementPage() {
  const [period, setPeriod] = useState('month');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('fast');

  const load = () => {
    setLoading(true);
    setError('');
    const q = new URLSearchParams({ period });
    if (period === 'custom' && start && end) {
      q.set('start', start);
      q.set('end', end);
    }
    api.get(`/reports/product-movement/?${q.toString()}`)
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load product movement data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (period === 'custom' && (!start || !end)) return;
    load();
    // eslint-disable-next-line
  }, [period, start, end]);

  const currency = data?.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);

  const exportReport = async (fmt) => {
    const q = new URLSearchParams({ period, output: fmt });
    if (period === 'custom') { q.set('start', start); q.set('end', end); }
    try {
      await downloadFile(
        `/reports/product-movement/?${q.toString()}`,
        `product_movement.${fmt === 'pdf' ? 'pdf' : 'xlsx'}`
      );
    } catch {
      setError('Export not available yet — the PDF/Excel variant needs a different endpoint.');
    }
  };

  const rows = data
    ? activeTab === 'fast' ? data.fast_movers
      : activeTab === 'slow' ? data.slow_movers
      : data.dead_stock
    : [];

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Product Movement</h1>
        <p className="text-sm text-slate-500 mt-1">
          Which products are moving fast and which are sitting on your shelves.
        </p>
      </div>

      {/* Period selector */}
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

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {loading && <p className="text-sm text-slate-500 mb-4">Loading…</p>}

      {data && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="stat-card">
              <p className="stat-label">Total Products</p>
              <p className="stat-value">{data.summary.total_products}</p>
            </div>
            <div className="stat-card green">
              <p className="stat-label">Active (sold)</p>
              <p className="stat-value">{data.summary.active_products}</p>
            </div>
            <div className="stat-card red">
              <p className="stat-label">Dead Stock</p>
              <p className="stat-value">{data.summary.dead_products}</p>
              <p className="text-xs text-slate-400 mt-1">
                {money(data.summary.dead_stock_value)} tied up
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Period</p>
              <p className="text-sm font-semibold text-slate-700 mt-2">
                {data.period.start} → {data.period.end}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 border-b border-slate-200">
            <div className="flex gap-1">
              <TabBtn active={activeTab === 'fast'} onClick={() => setActiveTab('fast')}>
                🚀 Fast Movers ({data.fast_movers.length})
              </TabBtn>
              <TabBtn active={activeTab === 'slow'} onClick={() => setActiveTab('slow')}>
                🐢 Slow Movers ({data.slow_movers.length})
              </TabBtn>
              <TabBtn active={activeTab === 'dead'} onClick={() => setActiveTab('dead')}>
                💀 Dead Stock ({data.dead_stock.length})
              </TabBtn>
            </div>
          </div>

          {activeTab === 'fast' && (
            <p className="text-sm text-slate-500 mb-4">
              Top sellers by quantity. These are the products you should always keep in stock.
            </p>
          )}
          {activeTab === 'slow' && (
            <p className="text-sm text-slate-500 mb-4">
              Products that barely moved this period. Consider reducing reorder levels.
            </p>
          )}
          {activeTab === 'dead' && (
            <p className="text-sm text-slate-500 mb-4">
              No sales this period. Capital tied up in inventory that isn't selling.
            </p>
          )}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="text-right">Qty Sold</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">In Stock</th>
                  <th>Last Sold</th>
                  <th className="text-right">Days Since</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-slate-400 py-8">
                      No products in this category for the selected period.
                    </td>
                  </tr>
                )}
                {rows.map((p, i) => (
                  <tr key={p.id} className={p.current_stock <= p.reorder_level ? 'bg-red-50/40' : ''}>
                    <td className="text-slate-400 text-xs">{i + 1}</td>
                    <td className="font-medium">{p.name}</td>
                    <td className="font-mono text-xs">{p.sku}</td>
                    <td className="text-right font-semibold">{p.qty_sold}</td>
                    <td className="text-right">{money(p.revenue)}</td>
                    <td className="text-right text-green-700 font-medium">{money(p.profit)}</td>
                    <td className="text-right">
                      <span className={p.current_stock <= p.reorder_level ? 'text-red-600 font-semibold' : ''}>
                        {p.current_stock}
                      </span>
                      {p.current_stock <= p.reorder_level && (
                        <span className="ml-2 badge badge-red">Low</span>
                      )}
                    </td>
                    <td className="text-sm text-slate-500">{p.last_sold || '—'}</td>
                    <td className="text-right">
                      {p.days_since_last_sale !== null ? (
                        <span className={
                          p.days_since_last_sale > 60 ? 'text-red-600 font-semibold'
                          : p.days_since_last_sale > 30 ? 'text-amber-600'
                          : 'text-slate-500'
                        }>
                          {p.days_since_last_sale}d
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ProtectedRoute>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}>
      {children}
    </button>
  );
}