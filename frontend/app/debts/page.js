'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';
import { useUser, can } from '@/lib/useUser';

export default function DebtsPage() {
  const user = useUser();
  const canEdit = can.editDebts(user);
  const canPay = can.recordPayment(user);

  const [debts, setDebts] = useState([]);
  const [promises, setPromises] = useState({ overdue: [], due_today: [], total_due: 0 });
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState({
    debt_type: 'receivable', party_name: '', party_phone: '',
    amount: '', reference: '', notes: '', promised_date: '',
  });
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [d, p, gs] = await Promise.all([
      api.get('/debts/'),
      api.get('/debts/promises/'),
      api.get('/auth/settings/'),
    ]);
    setDebts(d.data);
    setPromises(p.data);
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
      await api.post('/debts/', {
        ...form,
        amount: parseFloat(form.amount),
        promised_date: form.promised_date || null,
      });
      setForm({ debt_type: 'receivable', party_name: '', party_phone: '',
        amount: '', reference: '', notes: '', promised_date: '' });
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save debt.');
    } finally { setSaving(false); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/debts/${editModal.id}/`, {
        debt_type: editModal.debt_type,
        party_name: editModal.party_name,
        party_phone: editModal.party_phone,
        amount: parseFloat(editModal.amount),
        reference: editModal.reference,
        notes: editModal.notes,
        promised_date: editModal.promised_date || null,
      });
      setEditModal(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      alert(typeof d === 'object' ? JSON.stringify(d) : 'Could not update debt.');
    }
  };

  const deleteDebt = async (id) => {
    if (!confirm('Delete this debt? This cannot be undone.')) return;
    try {
      await api.delete(`/debts/${id}/`);
      load();
    } catch {
      alert('Could not delete debt.');
    }
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

  const promiseBadge = (s) => {
    if (s === 'overdue') return <span className="badge badge-red ml-1">Overdue</span>;
    if (s === 'due_today') return <span className="badge badge-amber ml-1">Due today</span>;
    return null;
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Debts</h1>
        <p className="text-sm text-slate-500 mt-1">
          <b>Receivables</b> — money owed to you. <b>Payables</b> — money you owe.
        </p>
      </div>

      {/* Promise banner */}
      {promises.total_due > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔔</span>
            <div className="flex-1">
              <p className="font-semibold text-amber-900">
                {promises.total_due} payment promise{promises.total_due !== 1 && 's'} need attention
              </p>
              {promises.overdue.length > 0 && (
                <p className="text-sm text-amber-800 mt-1">
                  <b className="text-red-700">{promises.overdue.length} overdue</b> —{' '}
                  {promises.overdue.slice(0, 3).map((d) => d.party_name).join(', ')}
                  {promises.overdue.length > 3 && ` +${promises.overdue.length - 3} more`}
                </p>
              )}
              {promises.due_today.length > 0 && (
                <p className="text-sm text-amber-800 mt-1">
                  <b>{promises.due_today.length} due today</b> —{' '}
                  {promises.due_today.slice(0, 3).map((d) => d.party_name).join(', ')}
                  {promises.due_today.length > 3 && ` +${promises.due_today.length - 3} more`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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

      {canEdit && (
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
            <div><label>Promised Payment Date</label>
              <input type="date" value={form.promised_date}
                onChange={(e) => setForm({ ...form, promised_date: e.target.value })} /></div>
            <div className="md:col-span-3"><label>Notes</label>
              <textarea rows={2} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any details about this debt…" /></div>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Debt'}</button>
          </div>
        </form>
      )}

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

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Party</th><th>Phone</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th>Promised</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && (
              <tr><td colSpan={10} className="text-center text-slate-400 py-8">No debts match your filters.</td></tr>
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
                  <td className="whitespace-nowrap text-sm">
                    {d.promised_date || '—'}
                    {promiseBadge(d.promise_status)}
                  </td>
                  <td><span className={badgeClass(d.status)}>{d.status}</span></td>
                  <td className="text-right whitespace-nowrap">
                    {canPay && d.status !== 'paid' && (
                      <button className="btn btn-primary btn-sm mr-1"
                        onClick={() => setPaymentModal({ debt: d, amount: balance, notes: '' })}>
                        Record Payment
                      </button>
                    )}
                    {canEdit && (
                      <button className="btn btn-secondary btn-sm mr-1"
                        onClick={() => setEditModal({
                          id: d.id,
                          debt_type: d.debt_type,
                          party_name: d.party_name,
                          party_phone: d.party_phone || '',
                          amount: d.amount,
                          reference: d.reference || '',
                          notes: d.notes || '',
                          promised_date: d.promised_date || '',
                        })}>
                        Edit
                      </button>
                    )}
                    {canEdit && (
                      <button className="btn btn-danger btn-sm" onClick={() => deleteDebt(d.id)}>Del</button>
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

      {/* Payment modal */}
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

      {/* Edit debt modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-4">Edit Debt</h3>
            <form onSubmit={saveEdit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label>Type</label>
                  <select value={editModal.debt_type}
                    onChange={(e) => setEditModal({ ...editModal, debt_type: e.target.value })}>
                    <option value="receivable">Receivable</option>
                    <option value="payable">Payable</option>
                  </select></div>
                <div><label>Party Name</label>
                  <input value={editModal.party_name}
                    onChange={(e) => setEditModal({ ...editModal, party_name: e.target.value })} required /></div>
                <div><label>Phone</label>
                  <input value={editModal.party_phone}
                    onChange={(e) => setEditModal({ ...editModal, party_phone: e.target.value })} /></div>
                <div><label>Amount</label>
                  <input type="number" step="0.01" value={editModal.amount}
                    onChange={(e) => setEditModal({ ...editModal, amount: e.target.value })} required /></div>
                <div><label>Reference</label>
                  <input value={editModal.reference}
                    onChange={(e) => setEditModal({ ...editModal, reference: e.target.value })} /></div>
                <div><label>Promised Payment Date</label>
                  <input type="date" value={editModal.promised_date}
                    onChange={(e) => setEditModal({ ...editModal, promised_date: e.target.value })} /></div>
                <div className="md:col-span-2"><label>Notes</label>
                  <textarea rows={4} value={editModal.notes}
                    onChange={(e) => setEditModal({ ...editModal, notes: e.target.value })}
                    placeholder="Payment terms, contact history, etc." /></div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}