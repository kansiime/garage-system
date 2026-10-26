'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api, { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';
import { useUser, can } from '@/lib/useUser';
import { useToast } from '@/components/Toast';
import { openWhatsApp, renderTemplate, DEFAULT_TEMPLATES } from '@/lib/whatsapp';
import { PAYMENT_METHODS } from '@/lib/paymentMethods';

const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const emptyFollowUp = (fields = {}) => ({
  contacted_on: todayISO(), method: 'call', note: '', promised_date: '', ...fields,
});

export default function DebtsPage() {
  const user = useUser();
  const toast = useToast();
  const canEdit = can.editDebts(user);
  const canPay = can.recordPayment(user);

  const [debts, setDebts] = useState([]);
  const [promises, setPromises] = useState({ overdue: [], due_today: [], total_due: 0 });
  const [currency, setCurrency] = useState('UGX');
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({
    debt_type: 'receivable', party_name: '', party_phone: '',
    amount: '', reference: '', notes: '', promised_date: '',
  });
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('unpaid');
  const [search, setSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [historyDebt, setHistoryDebt] = useState(null);
  const [historyTab, setHistoryTab] = useState('money');
  const [followUp, setFollowUp] = useState(emptyFollowUp());
  const [savingFollowUp, setSavingFollowUp] = useState(false);
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
    setSettings(gs.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('search');
      if (q) { setSearch(q); setFilterStatus('all'); }
    }
  }, []);

  const money = (n) => formatMoney(n, currency);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await api.post('/debts/', {
        ...form,
        amount: parseFloat(form.amount),
        promised_date: form.promised_date || null,
      });
      toast.success(res.data.merged
        ? `${money(form.amount)} added to ${res.data.party_name}'s existing debt — balance now ${money(res.data.balance)}`
        : `Debt recorded for ${res.data.party_name}`);
      setForm({ debt_type: 'receivable', party_name: '', party_phone: '',
        amount: '', reference: '', notes: '', promised_date: '' });
      load();
    } catch (err) {
      const msg = apiError(err, 'Could not save debt.');
      setError(msg);
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/debts/${editModal.id}/`, {
        party_name: editModal.party_name,
        party_phone: editModal.party_phone,
        amount: parseFloat(editModal.amount),
        reference: editModal.reference,
        notes: editModal.notes,
        promised_date: editModal.promised_date || null,
      });
      toast.success('Debt updated');
      setEditModal(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not update debt.'));
    }
  };

  const deleteDebt = async (id) => {
    if (!confirm('Delete this debt? This cannot be undone.')) return;
    try {
      await api.delete(`/debts/${id}/`);
      toast.success('Debt deleted');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not delete debt.'));
    }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post(`/debts/${paymentModal.debt.id}/record_payment/`, {
        amount: parseFloat(paymentModal.amount),
        method: paymentModal.method,
        notes: paymentModal.notes,
      });
      const left = parseFloat(res.data.balance);
      toast.success(left > 0
        ? `Payment of ${money(paymentModal.amount)} recorded — ${money(left)} still owed`
        : `Payment of ${money(paymentModal.amount)} recorded — debt fully paid`);
      setPaymentModal(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not record payment.'));
    }
  };

  const openHistory = (debt, tab, followUpFields) => {
    setHistoryDebt(debt);
    setHistoryTab(tab);
    setFollowUp(emptyFollowUp(followUpFields));
  };

  // Send the reminder, then leave the note ready to save as a record of it
  const remindAndLog = (debt) => {
    sendWhatsApp(debt, debt.promise_status === 'due_today' ? 'due_today' : 'debt');
    openHistory(debt, 'notes', {
      method: 'whatsapp',
      note: `Sent WhatsApp reminder for balance of ${money(debt.balance)}.`,
    });
  };

  const saveFollowUp = async (e) => {
    e.preventDefault();
    setSavingFollowUp(true);
    try {
      const res = await api.post(`/debts/${historyDebt.id}/add_follow_up/`, {
        ...followUp,
        promised_date: followUp.promised_date || null,
      });
      toast.success(followUp.promised_date
        ? `Follow-up saved — promised date set to ${followUp.promised_date}`
        : 'Follow-up saved');
      setHistoryDebt(res.data);
      setFollowUp(emptyFollowUp());
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save follow-up.'));
    } finally { setSavingFollowUp(false); }
  };

  // WhatsApp helpers
  const getTemplate = (which) => {
    if (which === 'due_today' && settings.whatsapp_template_promise_today) {
      return settings.whatsapp_template_promise_today;
    }
    if (settings.whatsapp_template_debt) return settings.whatsapp_template_debt;
    return DEFAULT_TEMPLATES.debt_reminder;
  };

  const sendWhatsApp = (debt, templateKey = 'debt') => {
    if (!debt.party_phone) {
      toast.warning(`${debt.party_name} has no phone number on file.`);
      return;
    }
    const template = templateKey === 'due_today'
      ? getTemplate('due_today')
      : getTemplate('debt');

    const message = renderTemplate(template, {
      name: debt.party_name,
      amount: money(debt.balance),
      business: settings.name || 'our garage',
      promised_date: debt.promised_date || 'soon',
    });

    openWhatsApp(debt.party_phone, message);
  };

  const sendBulkWhatsApp = () => {
    const list = [...promises.overdue, ...promises.due_today];
    if (list.length === 0) {
      toast.info('No overdue or due-today promises to remind.');
      return;
    }
    const withPhone = list.filter((d) => d.party_phone);
    if (withPhone.length === 0) {
      toast.warning('None of the debtors have phone numbers on file.');
      return;
    }
    if (!confirm(`Open WhatsApp for ${withPhone.length} debtor(s)? Each opens in a new tab.`)) return;

    withPhone.forEach((d, i) => {
      // Stagger to avoid browser popup blocking
      setTimeout(() => sendWhatsApp(d, d.promise_status === 'due_today' ? 'due_today' : 'debt'), i * 600);
    });
    toast.info(`Opening ${withPhone.length} WhatsApp window(s)…`);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debts.filter((d) => {
      if (filterType !== 'all' && d.debt_type !== filterType) return false;
      if (filterStatus === 'unpaid' ? d.status === 'paid'
        : filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (!q) return true;
      return (
        d.party_name.toLowerCase().includes(q) ||
        (d.party_phone || '').toLowerCase().includes(q) ||
        (d.reference || '').toLowerCase().includes(q) ||
        (d.charges || []).some((c) => (c.reference || '').toLowerCase().includes(q))
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
          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-2xl">🔔</span>
            <div className="flex-1 min-w-0">
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
            <button
              onClick={sendBulkWhatsApp}
              className="btn btn-success whitespace-nowrap"
            >
              💬 WhatsApp all
            </button>
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
          <p className="text-xs text-slate-500 -mt-2 mb-3">
            If this person already has an unpaid debt (same phone, or same name), the amount is added to it.
          </p>
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
              <option value="unpaid">Unpaid (open + partial)</option>
              <option value="all">All</option>
              <option value="open">Open (nothing paid)</option>
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
                  <td>
                    <div className="font-medium">
                      {d.customer
                        ? <Link href={`/customers/${d.customer}`} className="hover:underline">{d.party_name}</Link>
                        : d.party_name}
                    </div>
                    {d.follow_ups?.length > 0 && (
                      <div className="text-xs text-slate-400" title={d.follow_ups[0].note}>
                        Last contact {d.follow_ups[0].contacted_on}
                      </div>
                    )}
                  </td>
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
                    {d.party_phone && d.status !== 'paid' && (
                      <button className="btn btn-success btn-sm mr-1"
                        onClick={() => remindAndLog(d)}
                        title="Send WhatsApp reminder">
                        💬
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm mr-1" onClick={() => openHistory(d, 'notes')}
                      title="Follow-up notes">
                      📝 Notes{d.follow_ups?.length > 0 && ` (${d.follow_ups.length})`}
                    </button>
                    <button className="btn btn-secondary btn-sm mr-1" onClick={() => openHistory(d, 'money')}>
                      History
                    </button>
                    {canPay && d.status !== 'paid' && (
                      <button className="btn btn-primary btn-sm mr-1"
                        onClick={() => setPaymentModal({ debt: d, amount: '', method: 'cash', notes: '' })}>
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

      {paymentModal && (() => {
        const owed = parseFloat(paymentModal.debt.balance);
        const paying = parseFloat(paymentModal.amount) || 0;
        const left = owed - paying;
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-1">Record Payment</h3>
            <p className="text-sm text-slate-500 mb-4">
              {paymentModal.debt.party_name} — balance <b>{money(owed)}</b>
            </p>
            <div className="mb-4">
              <DebtHistory debt={paymentModal.debt} money={money} compact />
            </div>
            <form onSubmit={recordPayment}>
              <div className="mb-1"><label>Amount being paid now</label>
                <input type="number" step="0.01" min="0.01" max={owed}
                  placeholder={`Any amount up to ${money(owed)}`}
                  value={paymentModal.amount}
                  onChange={(e) => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                  required autoFocus /></div>
              <div className="mb-3 flex items-center justify-between text-sm">
                <button type="button" className="text-blue-700 hover:underline"
                  onClick={() => setPaymentModal({ ...paymentModal, amount: String(owed) })}>
                  Pay full balance ({money(owed)})
                </button>
                {paying > 0 && (
                  left < 0
                    ? <span className="text-red-600 font-semibold">More than the balance</span>
                    : <span className="text-slate-600">Remaining after this: <b>{money(left)}</b></span>
                )}
              </div>
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label>Paid By</label>
                  <select value={paymentModal.method}
                    onChange={(e) => setPaymentModal({ ...paymentModal, method: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select></div>
                <div className="md:col-span-2"><label>Notes</label>
                  <input placeholder="e.g. Transaction ID, paid by brother…" value={paymentModal.notes}
                    onChange={(e) => setPaymentModal({ ...paymentModal, notes: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setPaymentModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={paying <= 0 || left < 0}>
                  {paying > 0 ? `Save Payment of ${money(paying)}` : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {historyDebt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setHistoryDebt(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold">{historyDebt.party_name}</h3>
                <p className="text-sm text-slate-500">
                  {historyDebt.party_phone || 'No phone'} · {historyDebt.debt_type}
                </p>
              </div>
              <span className={badgeClass(historyDebt.status)}>{historyDebt.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Total credit</p>
                <p className="font-semibold">{money(historyDebt.amount)}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs text-slate-500">Paid</p>
                <p className="font-semibold text-green-700">{money(historyDebt.amount_paid)}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs text-slate-500">Balance</p>
                <p className="font-semibold text-red-600">{money(historyDebt.balance)}</p>
              </div>
            </div>
            <div className="flex gap-1 mb-3 border-b border-slate-200">
              {[['money', 'Credit & payments'], ['notes', `Follow-up notes (${historyDebt.follow_ups?.length || 0})`]].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setHistoryTab(key)}
                  className={`px-3 py-2 text-sm -mb-px border-b-2 ${historyTab === key
                    ? 'border-blue-600 text-blue-700 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            {historyTab === 'money' ? (
              <DebtHistory debt={historyDebt} money={money} canOpenPurchases={canEdit} />
            ) : (
              <>
                {canPay && (
                  <form onSubmit={saveFollowUp} className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label>Date contacted</label>
                        <input type="date" max={todayISO()} value={followUp.contacted_on}
                          onChange={(e) => setFollowUp({ ...followUp, contacted_on: e.target.value })} required /></div>
                      <div><label>How</label>
                        <select value={followUp.method}
                          onChange={(e) => setFollowUp({ ...followUp, method: e.target.value })}>
                          <option value="call">Phone call</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="sms">SMS</option>
                          <option value="visit">In person</option>
                          <option value="other">Other</option>
                        </select></div>
                      <div><label>New promised date</label>
                        <input type="date" min={todayISO()} value={followUp.promised_date}
                          onChange={(e) => setFollowUp({ ...followUp, promised_date: e.target.value })} /></div>
                      <div className="md:col-span-3"><label>What was said</label>
                        <textarea rows={2} value={followUp.note} required
                          onChange={(e) => setFollowUp({ ...followUp, note: e.target.value })}
                          placeholder="e.g. Called, he said he will pay half on Friday…" /></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">Saved notes cannot be changed or deleted.</p>
                      <button className="btn btn-primary btn-sm" disabled={savingFollowUp || !followUp.note.trim()}>
                        {savingFollowUp ? 'Saving…' : 'Save Note'}
                      </button>
                    </div>
                  </form>
                )}
                <FollowUpList followUps={historyDebt.follow_ups || []} />
              </>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {canPay && historyDebt.status !== 'paid' && (
                <button className="btn btn-primary" onClick={() => {
                  setPaymentModal({ debt: historyDebt, amount: '', method: 'cash', notes: '' });
                  setHistoryDebt(null);
                }}>Record Payment</button>
              )}
              <button className="btn btn-secondary" onClick={() => setHistoryDebt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-4">Edit Debt</h3>
            <form onSubmit={saveEdit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label>Type</label>
                  <select value={editModal.debt_type} disabled title="Debt type cannot be changed">
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

function FollowUpList({ followUps }) {
  if (followUps.length === 0) return <p className="text-sm text-slate-400">No follow-ups recorded yet.</p>;
  return (
    <ul className="max-h-[40vh] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
      {followUps.map((f) => (
        <li key={f.id} className="px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{f.contacted_on} · {f.method_display}</span>
            {f.promised_date && <span className="badge badge-amber">Promised {f.promised_date}</span>}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{f.note}</p>
          <p className="mt-1 text-xs text-slate-400">
            Logged {new Date(f.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            {f.recorded_by && ` by ${f.recorded_by}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

// Credits and payments in date order, with the balance after each line.
// Debts from before the history existed may carry money paid at the time of
// sale that has no payment record; that shows as one "Paid at sale" line.
function buildHistory(debt) {
  const charges = (debt.charges || []).map((c) => ({
    key: `c-${c.id}`, date: c.created_at, change: parseFloat(c.amount),
    label: parseFloat(c.amount) < 0 ? 'Amount reduced' : 'Credit given',
    detail: [c.reference, c.notes].filter(Boolean).join(' — '),
    sourceNotes: c.source_notes || '',
    sale: c.sale, purchase: c.purchase,
    by: c.recorded_by,
  }));
  const payments = (debt.payments || []).map((p) => ({
    key: `p-${p.id}`, date: p.created_at, change: -parseFloat(p.amount),
    label: p.method === 'adjustment' ? 'Return credited' : `Payment · ${p.method_display}`,
    detail: p.notes || '', by: p.recorded_by,
  }));
  const recorded = payments.reduce((t, p) => t - p.change, 0);
  const unrecorded = parseFloat(debt.amount_paid) - recorded;
  const rows = [...charges, ...payments];
  if (unrecorded > 0.004) {
    const first = charges.length ? charges[0].date : debt.created_at;
    rows.push({ key: 'upfront', date: first, change: -unrecorded,
      label: 'Paid at sale', detail: 'Paid when the debt was recorded', by: '', after: true });
  }
  rows.sort((a, b) => new Date(a.date) - new Date(b.date) || (a.after ? 1 : 0) - (b.after ? 1 : 0));
  let running = 0;
  return rows.map((r) => ({ ...r, balance: (running += r.change) }));
}

function DebtHistory({ debt, money, compact = false, canOpenPurchases = false }) {
  const rows = buildHistory(debt);
  if (rows.length === 0) return <p className="text-sm text-slate-400">No history yet.</p>;
  return (
    <div className={`overflow-y-auto border border-slate-200 rounded-lg ${compact ? 'max-h-48' : 'max-h-[55vh]'}`}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Entry</th>
            <th className="text-right px-3 py-2">Amount</th>
            <th className="text-right px-3 py-2">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                {new Date(r.date).toLocaleDateString()}
                {!compact && <div className="text-xs text-slate-400">{new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{r.label}</div>
                {!compact && (r.detail || r.by) && (
                  <div className="text-xs text-slate-500">
                    {r.detail}{r.detail && r.by && ' · '}{r.by && `by ${r.by}`}
                  </div>
                )}
                {!compact && r.sourceNotes && (
                  <div className="text-xs text-slate-700 mt-0.5">📝 {r.sourceNotes}</div>
                )}
                {!compact && r.sale && (
                  <Link href={`/sales?sale=${r.sale}`} className="text-xs text-blue-700 hover:underline">
                    View sale →
                  </Link>
                )}
                {!compact && r.purchase && canOpenPurchases && (
                  <Link href={`/purchases?purchase=${r.purchase}`} className="text-xs text-blue-700 hover:underline">
                    View purchase →
                  </Link>
                )}
              </td>
              <td className={`px-3 py-2 text-right whitespace-nowrap ${r.change > 0 ? 'text-red-600' : 'text-green-700'}`}>
                {r.change > 0 ? '+' : '−'}{money(Math.abs(r.change))}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{money(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

