'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import ProductPicker from '@/components/ProductPicker';
import { formatMoney } from '@/lib/format';

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState({
    reference: '',
    supplier: '',
    status: 'pending',
    amount_paid: '',
    notes: '',
  });
  const [items, setItems] = useState([{ product: '', quantity: 1, unit_cost: 0 }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  const addItem = () => setItems([...items, { product: '', quantity: 1, unit_cost: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const updateItem = (i, field, value) => {
    const copy = [...items];
    copy[i][field] = value;
    if (field === 'product') {
      const p = products.find((x) => x.id === parseInt(value));
      if (p) copy[i].unit_cost = parseFloat(p.cost_price);
    }
    setItems(copy);
  };

  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);

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
      notes: '',
    });
    setItems([{ product: '', quantity: 1, unit_cost: 0 }]);
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
          unit_cost: parseFloat(i.unit_cost),
        })),
      });
      resetForm();
      load();
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail ||
        (typeof data === 'object' ? JSON.stringify(data) : 'Could not save purchase.')
      );
    } finally {
      setSaving(false);
    }
  };

  const money = (n) => formatMoney(n, currency);

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
          Record purchases from suppliers. Set status to <b>Received</b> to add stock automatically.
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
    if (product) updateItem(i, 'unit_cost', parseFloat(product.cost_price));
  }}
/>
                </div>
                <div className="col-span-4 md:col-span-2">
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
                <div className="col-span-3 md:col-span-2 text-right">
                  <label className="md:hidden">Subtotal</label>
                  <p className="py-2 text-sm font-semibold">
                    {money((it.quantity || 0) * (it.unit_cost || 0))}
                  </p>
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

      <div className="table-wrap overflow-x-auto">
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
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.reference}</td>
                <td className="whitespace-nowrap">{new Date(p.created_at).toLocaleString()}</td>
                <td>{p.supplier_name || '—'}</td>
                <td>
                  <span className={statusBadge(p.status)}>{p.status}</span>
                </td>
                <td className="text-right font-medium">{money(p.total_amount)}</td>
                <td className="text-right">{money(p.amount_paid)}</td>
                <td className={`text-right ${parseFloat(p.balance) > 0 ? 'text-red-600 font-semibold' : ''}`}>
                  {money(p.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ProtectedRoute>
  );
}