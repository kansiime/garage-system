'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';

export default function CustomersPage() {
  const [data, setData] = useState({ customers: [], currency: 'UGX' });
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const res = await api.get(`/reports/customers/${q}`);
      setData(res.data);
    } catch {
      setData({ customers: [], currency: 'UGX' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const money = (n) => formatMoney(n, data.currency);
  const filtered = data.customers;
  const pg = usePagination(filtered, pageSize);

  const totalReceivable = useMemo(
    () => filtered.reduce((s, c) => s + (c.balance || 0), 0),
    [filtered]
  );
  const totalSpentAll = useMemo(
    () => filtered.reduce((s, c) => s + (c.total_spent || 0), 0),
    [filtered]
  );

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <p className="text-sm text-slate-500 mt-1">
          All customers derived from your sales and debts. Click any name to see their full history.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="stat-label">Total Customers</p>
          <p className="stat-value">{filtered.length}</p>
        </div>
        <div className="stat-card amber">
          <p className="stat-label">Total Receivables</p>
          <p className="stat-value">{money(totalReceivable)}</p>
        </div>
        <div className="stat-card green">
          <p className="stat-label">Lifetime Sales Value</p>
          <p className="stat-value">{money(totalSpentAll)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label>Search customers</label>
            <input
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label>Show per page</label>
            <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500 mb-4">Loading customers…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th className="text-right">Sales</th>
              <th className="text-right">Total Spent</th>
              <th className="text-right">Outstanding</th>
              <th>Last Visit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  {search ? `No customers match "${search}".` : 'No customers yet — they appear as soon as you make a sale.'}
                </td>
              </tr>
            )}
            {pg.pageItems.map((c) => (
              <tr key={c.key}>
                <td>
                  <Link href={`/customers/${encodeURIComponent(c.key)}`}
                    className="font-medium text-blue-700 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="text-sm text-slate-600">{c.phone || '—'}</td>
                <td className="text-right">{c.sale_count}</td>
                <td className="text-right font-semibold">{money(c.total_spent)}</td>
                <td className={`text-right font-semibold ${c.balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {c.balance > 0 ? money(c.balance) : '—'}
                </td>
                <td className="text-sm text-slate-500">{c.last_visit}</td>
                <td className="text-right">
                  <Link href={`/customers/${encodeURIComponent(c.key)}`}
                    className="btn btn-secondary btn-sm">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} goTo={pg.setPage}
        startIndex={pg.startIndex} endIndex={pg.endIndex}
        totalItems={filtered.length} label="customers" />
    </ProtectedRoute>
  );
}