'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';

export default function DebtsPage() {
  const [debts, setDebts] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState({
    debt_type: 'receivable', party_name: '', party_phone: '',
    amount: '', reference: '', notes: '',
  });
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [d, gs] = await Promise.all([
      api.get('/debts/'),
      api.get('/auth/settings/'),
    ]);
    setDebts(d.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('search');
      if (q) setSearch(q);
    }
  }, []);

  const money = (n) => formatMoney(n, currency);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/debts/', { ...form, amount: parseFloat(form.amount) });
      setForm({ debt_type: 'receivable', party_name: '', party_phone: '', amount: '', reference: '', notes: '' });
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save debt.');
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debts.filter((d) => {
      if (filterType !== 'all' && d.debt_type !== filterType) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (!q) return true;
      return (
        d.party_name.toLowerCase().includes(q) ||
        (d.party_phone || '').toLowerCase().includes(q) ||
        (d.reference || '').toLowerCase().includes(q)
      );
    });
  }, [debts, filterType, filterStatus, search]);

  const pg = usePagination(filtered, 10);

  const stats = useMemo(() => {
    const rec = debts.filter((d) => d.debt_type === 'receivable');
    const pay = debts.filter((d) => d.debt_type === 'payable');
    const sum = (arr) => arr.reduce((s, d) => s + parseFloat(d.balance || 0), 0);
    return { receivable: sum(rec), payable: sum(pay), openCount: debts.filter((d) => d.status !== 'paid').length };
  }, [debts]);

  const badgeClass = (s) => {
    if (s === 'paid') return 'badge badge-green';
    if (s === 'partial') return 'badge badge-amber';
    return 'badge badge-red';
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Debts</h1>
        <p className="text-sm text-slate-500 mt-1">
          <b>Receivables</b> — money owed to you. <b>Payables</b> — money you owe.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card amber">
          <p className="stat-label">Total Receivables</p>
          <p className="stat-value">{money(stats.receivable)}</p>
        </div>
        <div className="stat-card red">
          <p className="stat-label">Total Payables</p>
          <p className="stat-value">{money(stats.payable)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Unpaid Debts</p>
          <p className="stat-value">{stats.openCount}</p>
        </div>
      </div>

      {error && (<div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>)}

      <form onSubmit={submit} className="card mb-6">
        <p className="card-title">Record New Debt</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label>Type</label>
            <select value={form.debt_type} onChange={(e) => setForm({ ...form, debt_type: e.target.value })}>
              <option value="receivable">Receivable (owed to us)</option>
              <option value="payable">Payable (we owe)</option>
            </select></div>
          <div><label>Party Name</label>
            <input value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} required /></div>
          <div><label>Phone</label>
            <input value={form.party_phone} onChange={(e) => setForm({ ...form, party_phone: e.target.value })} /></div>
          <div><label>Amount</label>
            <input type="number" step="0.01" min="0" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
          <div><label>Reference</label>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div><label>Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Debt'}</button>
        </div>
      </form>

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><label>Search</label>
            <input placeholder="Name, phone, or reference…"
              value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div><label>Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All</option>
              <option value="receivable">Receivables</option>
              <option value="payable">Payables</option>
            </select></div>
          <div><label>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select></div>
        </div>
      </div>

      <div className="table-wrap overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Party</th><th>Phone</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && (
              <tr><td colSpan={9} className="text-center text-slate-400 py-8">No debts match your filters.</td></tr>
            )}
            {pg.pageItems.map((d) => {
              const balance = parseFloat(d.balance || 0);
              return (
                <tr key={d.id}>
                  <td className="whitespace-nowrap text-sm text-slate-600">{new Date(d.created_at).toLocaleDateString()}</td>
                  <td><span className={d.debt_type === 'receivable' ? 'badge badge-amber' : 'badge badge-red'}>{d.debt_type}</span></td>
                  <td className="font-medium">{d.party_name}</td>
                  <td className="text-sm text-slate-600">{d.party_phone || '—'}</td>
                  <td className="text-right">{money(d.amount)}</td>
                  <td className="text-right">{money(d.amount_paid)}</td>
                  <td className={`text-right font-semibold ${balance > 0 ? 'text-red-600' : 'text-slate-500'}`}>{money(balance)}</td>
                  <td><span className={badgeClass(d.status)}>{d.status}</span></td>
                  <td className="text-right whitespace-nowrap">
                    {d.status !== 'paid' && (
                      <button className="btn btn-primary btn-sm"
                        onClick={() => setPaymentModal({ debt: d, amount: balance, notes: '' })}>
                        Record Payment
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} goTo={pg.setPage}
        startIndex={pg.startIndex} endIndex={pg.endIndex}
        totalItems={filtered.length} label="debts" />

      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-1">Record Payment</h3>
            <p className="text-sm text-slate-500 mb-4">
              {paymentModal.debt.party_name} — balance <b>{money(paymentModal.debt.balance)}</b>
            </p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await api.post(`/debts/${paymentModal.debt.id}/record_payment/`, {
                amount: parseFloat(paymentModal.amount), notes: paymentModal.notes,
              });
              setPaymentModal(null);
              load();
            }}>
              <div className="mb-3"><label>Payment Amount</label>
                <input type="number" step="0.01" min="0.01"
                  max={parseFloat(paymentModal.debt.balance)}
                  value={paymentModal.amount}
                  onChange={(e) => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                  required autoFocus /></div>
              <div className="mb-4"><label>Notes</label>
                <input value={paymentModal.notes}
                  onChange={(e) => setPaymentModal({ ...paymentModal, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setPaymentModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}