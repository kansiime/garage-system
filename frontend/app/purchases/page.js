'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { apiError } from '@/lib/api';
import ProductPicker from '@/components/ProductPicker';
import { formatMoney } from '@/lib/format';
import { useUser, can } from '@/lib/useUser';
import { useToast } from '@/components/Toast';
import { PAYMENT_METHODS, methodLabel } from '@/lib/paymentMethods';

const EMPTY_ITEM = { product: '', quantity: 1, unit_cost: 0, subtotal: 0, from: 'unit' };
const round2 = (n) => Math.round(n * 100) / 100;
// Local YYYY-MM-DD; toISOString() would give yesterday before 3am in Uganda
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function PurchasesPage() {
  const user = useUser();
  const toast = useToast();
  const canPay = can.paySuppliers(user);
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState({
    reference: '',
    supplier: '',
    status: 'pending',
    amount_paid: '',
    payment_method: 'cash',
    notes: '',
    purchase_date: '',
  });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState({ amount: '', method: 'cash', notes: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [p, pr, s, gs] = await Promise.all([
      api.get('/purchases/'),
      api.get('/inventory/products/'),
      api.get('/inventory/suppliers/'),
      api.get('/auth/settings/'),
    ]);
    setPurchases(p.data);
    setProducts(pr.data);
    setSuppliers(s.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
  };
  useEffect(() => { load(); }, []);

  // Opened from a link such as /purchases?purchase=12 — show that purchase's details
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('purchase');
    if (!id) return;
    api.get(`/purchases/${id}/`)
      .then((res) => setSelected(res.data))
      .catch((err) => toast.error(apiError(err, 'Could not open that purchase.')));
    // eslint-disable-next-line
  }, []);

  const addItem = () => setItems([...items, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  // Suppliers often quote a line total (6 for 113,000) whose unit cost doesn't
  // divide evenly, so whichever of unit cost / total was typed last is kept
  // exact and the other is worked out from it.
  const updateItem = (i, field, value) => {
    const copy = [...items];
    const it = { ...copy[i], [field]: value };
    if (field === 'product') {
      const p = products.find((x) => x.id === parseInt(value));
      if (p) {
        it.unit_cost = parseFloat(p.cost_price);
        it.from = 'unit';
      }
    }
    if (field === 'unit_cost') it.from = 'unit';
    if (field === 'subtotal') it.from = 'total';
    const qty = it.quantity || 0;
    if (it.from === 'total') it.unit_cost = qty ? round2((it.subtotal || 0) / qty) : 0;
    else it.subtotal = round2(qty * (it.unit_cost || 0));
    copy[i] = it;
    setItems(copy);
  };

  const total = items.reduce((s, i) => s + (i.subtotal || 0), 0);

  const generateRef = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `PO-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const resetForm = () => {
    setForm({
      reference: generateRef(),
      supplier: '',
      status: 'pending',
      amount_paid: '',
      payment_method: 'cash',
      notes: '',
      purchase_date: localToday(),
    });
    setItems([{ ...EMPTY_ITEM }]);
  };

  useEffect(() => { resetForm(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (items.some((i) => !i.product || i.quantity <= 0)) {
      setError('Please pick a product and quantity for every line.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/purchases/', {
        ...form,
        amount_paid: parseFloat(form.amount_paid || 0),
        items: items.map((i) => ({
          product: parseInt(i.product),
          quantity: parseInt(i.quantity),
          subtotal: round2(i.subtotal || 0),
        })),
      });
      resetForm();
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save purchase.'));
    } finally {
      setSaving(false);
    }
  };

  const money = (n) => formatMoney(n, currency);

  const openPurchase = (p) => {
    setSelected(p);
    setPayment({ amount: '', method: 'cash', notes: '' });
  };

  // Keep the open purchase and the list in step after a change
  const applyUpdate = (updated) => {
    setSelected(updated);
    setPurchases((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  };

  const changeStatus = async (status) => {
    const msg = status === 'received'
      ? `Mark ${selected.reference} as received? This adds the items to stock and cannot be undone.`
      : `Cancel ${selected.reference}? Any unpaid balance owed to the supplier will be removed. This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const res = await api.patch(`/purchases/${selected.id}/`, { status });
      applyUpdate(res.data);
      toast.success(status === 'received' ? 'Purchase received — stock updated' : 'Purchase cancelled');
    } catch (err) {
      toast.error(apiError(err, 'Could not update purchase.'));
    } finally {
      setBusy(false);
    }
  };

  const paySupplier = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/purchases/${selected.id}/pay/`, {
        amount: parseFloat(payment.amount),
        method: payment.method,
        notes: payment.notes,
      });
      applyUpdate(res.data);
      setPayment({ amount: '', method: 'cash', notes: '' });
      const left = parseFloat(res.data.balance);
      toast.success(left > 0
        ? `Payment of ${money(payment.amount)} recorded — ${money(left)} still owed`
        : `Payment of ${money(payment.amount)} recorded — purchase fully paid`);
    } catch (err) {
      toast.error(apiError(err, 'Could not record payment.'));
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status) => {
    if (status === 'received') return 'badge badge-green';
    if (status === 'cancelled') return 'badge badge-red';
    return 'badge badge-amber';
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record purchases from suppliers. Set status to <b>Received</b> to add stock automatically. Click a purchase to see its items, receive it or pay the supplier.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="card mb-6">
        <p className="card-title">New Purchase</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label>Reference</label>
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={form.purchase_date}
              max={localToday()}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value || localToday() })}
              required
            />
          </div>
          <div>
            <label>Supplier</label>
            <select
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            >
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="pending">Pending (stock not added)</option>
              <option value="received">Received (add to stock)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label>Amount Paid</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={form.amount_paid}
              onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
            />
          </div>
          {parseFloat(form.amount_paid) > 0 && (
            <div>
              <label>Paid By</label>
              <select value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            <label>Notes</label>
            <input
              placeholder="Optional"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Items</p>
            <button type="button" onClick={addItem} className="btn btn-secondary btn-sm">
              + Add item
            </button>
          </div>

          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-5">
                  <label className="md:hidden">Product</label>
<ProductPicker
  products={products}
  value={it.product}
  currency={currency}
  onChange={(id, product) => {
    updateItem(i, 'product', id);
  }}
/>
                </div>
                <div className="col-span-3 md:col-span-2">
                  <label className="md:hidden">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 0)}
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="md:hidden">Unit Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={it.unit_cost}
                    onChange={(e) => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="md:hidden">Total</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.subtotal}
                    onChange={(e) => updateItem(i, 'subtotal', parseFloat(e.target.value) || 0)}
                    required
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeItem(i)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold">Total</p>
            <p className="text-2xl font-bold text-slate-900">{money(total)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              Clear
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Purchase'}
            </button>
          </div>
        </div>
      </form>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Status</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  No purchases recorded yet.
                </td>
              </tr>
            )}
            {purchases.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openPurchase(p)}>
                <td className="font-mono text-xs">{p.reference}</td>
                <td className="whitespace-nowrap">{p.purchase_date}</td>
                <td>{p.supplier_name || '—'}</td>
                <td>
                  <span className={statusBadge(p.status)}>{p.status}</span>
                </td>
                <td className="text-right font-medium">{money(p.total_amount)}</td>
                <td className="text-right">{money(p.amount_paid)}</td>
                <td className={`text-right ${p.status !== 'cancelled' && parseFloat(p.balance) > 0 ? 'text-red-600 font-semibold' : ''}`}>
                  {p.status === 'cancelled' ? '—' : money(p.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (() => {
        const owed = parseFloat(selected.balance);
        const paying = parseFloat(payment.amount) || 0;
        const left = owed - paying;
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold font-mono">{selected.reference}</h3>
                <p className="text-sm text-slate-500">
                  {selected.supplier_name || 'No supplier'} · {selected.purchase_date}
                  <span className="text-slate-400"> (entered {new Date(selected.created_at).toLocaleString()})</span>
                </p>
              </div>
              <span className={statusBadge(selected.status)}>{selected.status}</span>
            </div>

            <div className="table-scroll mb-4">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit Cost</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.product_name}</td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{money(it.unit_cost)}</td>
                      <td className="text-right font-medium">{money(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Total</p>
                <p className="font-semibold">{money(selected.total_amount)}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs text-slate-500">Paid</p>
                <p className="font-semibold text-green-700">{money(selected.amount_paid)}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs text-slate-500">Balance</p>
                <p className="font-semibold text-red-600">
                  {selected.status === 'cancelled' ? '—' : money(owed)}
                </p>
              </div>
            </div>

            {parseFloat(selected.paid_at_purchase) > 0 && (
              <p className="text-sm text-slate-600 mb-2">
                <b>Paid when recorded:</b> {money(selected.paid_at_purchase)} by {methodLabel(selected.payment_method)}
              </p>
            )}
            {selected.notes && (
              <p className="text-sm text-slate-600 mb-4"><b>Notes:</b> {selected.notes}</p>
            )}

            {selected.status === 'pending' && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-amber-800">Stock has not been added yet.</p>
                <div className="flex gap-2">
                  {canPay && (
                    <button className="btn btn-danger btn-sm" disabled={busy}
                      onClick={() => changeStatus('cancelled')}>
                      Cancel Purchase
                    </button>
                  )}
                  <button className="btn btn-success btn-sm" disabled={busy}
                    onClick={() => changeStatus('received')}>
                    Mark Received
                  </button>
                </div>
              </div>
            )}

            {canPay && selected.status !== 'cancelled' && owed > 0 && (
              <form onSubmit={paySupplier} className="border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">Pay Supplier</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-1">
                  <div><label>Amount being paid now</label>
                    <input type="number" step="0.01" min="0.01" max={owed}
                      placeholder={`Any amount up to ${money(owed)}`}
                      value={payment.amount}
                      onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                      required /></div>
                  <div><label>Paid By</label>
                    <select value={payment.method}
                      onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select></div>
                  <div className="md:col-span-2"><label>Notes</label>
                    <input placeholder="e.g. Transaction ID, who paid…" value={payment.notes}
                      onChange={(e) => setPayment({ ...payment, notes: e.target.value })} /></div>
                </div>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <button type="button" className="text-blue-700 hover:underline"
                    onClick={() => setPayment({ ...payment, amount: String(owed) })}>
                    Pay full balance ({money(owed)})
                  </button>
                  {paying > 0 && (
                    left < 0
                      ? <span className="text-red-600 font-semibold">More than the balance</span>
                      : <span className="text-slate-600">Remaining after this: <b>{money(left)}</b></span>
                  )}
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn btn-primary" disabled={busy || paying <= 0 || left < 0}>
                    {paying > 0 ? `Save Payment of ${money(paying)}` : 'Save Payment'}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-5 flex justify-end">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
        );
      })()}
    </ProtectedRoute>
  );
}