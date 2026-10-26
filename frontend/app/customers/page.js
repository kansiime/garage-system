'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api, { apiError } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';

export default function CustomersPage() {
  const toast = useToast();
  const [adding, setAdding] = useState(null);
  const [data, setData] = useState({ customers: [], currency: 'UGX' });
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const res = await api.get(`/customers/${q}`);
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
          Everyone you have sold to. Customers are added automatically from sales, or add one here. Click a name to see their full history.
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

      {adding ? (
        <form className="card mb-4" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post('/customers/', adding);
            toast.success(`${adding.name} added`);
            setAdding(null);
            load();
          } catch (err) {
            toast.error(apiError(err, 'Could not add customer.'));
          }
        }}>
          <p className="card-title">New Customer</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label>Name</label>
              <input value={adding.name} required autoFocus
                onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></div>
            <div><label>Phone</label>
              <input value={adding.phone}
                onChange={(e) => setAdding({ ...adding, phone: e.target.value })} /></div>
            <div><label>Notes</label>
              <input value={adding.notes} placeholder="e.g. Vehicle, where they work…"
                onChange={(e) => setAdding({ ...adding, notes: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn btn-primary">Save Customer</button>
          </div>
        </form>
      ) : (
        <div className="mb-4 flex justify-end">
          <button className="btn btn-primary" onClick={() => setAdding({ name: '', phone: '', notes: '' })}>
            + New Customer
          </button>
        </div>
      )}

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
              <tr key={c.id}>
                <td>
                  <Link href={`/customers/${c.id}`}
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
                  <Link href={`/customers/${c.id}`}
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