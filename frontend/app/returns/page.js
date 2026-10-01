'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProductPicker from '@/components/ProductPicker';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';

export default function ReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    reference: '', return_type: 'sales', resolution: 'credit',
    party_name: '', party_phone: '', original_reference: '',
    reason: '', notes: '',
  });
  const [items, setItems] = useState([{ product: '', quantity: 1, unit_price: 0 }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [r, p, gs] = await Promise.all([
      api.get('/returns/'),
      api.get('/inventory/products/'),
      api.get('/auth/settings/'),
    ]);
    setReturns(r.data);
    setProducts(p.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
  };
  useEffect(() => { load(); }, []);

  const money = (n) => formatMoney(n, currency);

  const generateRef = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `RET-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };
  const resetForm = () => {
    setForm({
      reference: generateRef(), return_type: 'sales', resolution: 'credit',
      party_name: '', party_phone: '', original_reference: '', reason: '', notes: '',
    });
    setItems([{ product: '', quantity: 1, unit_price: 0 }]);
  };
  useEffect(() => { resetForm(); }, []);

  const addItem = () => setItems([...items, { product: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, value) => {
    const copy = [...items];
    copy[i][field] = value;
    if (field === 'product') {
      const p = products.find((x) => x.id === parseInt(value));
      if (p) copy[i].unit_price = parseFloat(
        form.return_type === 'sales' ? p.selling_price : p.cost_price
      );
    }
    setItems(copy);
  };
  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (items.some((i) => !i.product || i.quantity <= 0)) {
      setError('Please pick a product and quantity for every line.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/returns/', {
        ...form,
        items: items.map((i) => ({
          product: parseInt(i.product),
          quantity: parseInt(i.quantity),
          unit_price: parseFloat(i.unit_price),
        })),
      });
      resetForm();
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save return.');
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return returns.filter((r) => {
      if (filterType !== 'all' && r.return_type !== filterType) return false;
      if (!q) return true;
      return (
        (r.reference || '').toLowerCase().includes(q) ||
        (r.party_name || '').toLowerCase().includes(q) ||
        (r.original_reference || '').toLowerCase().includes(q)
      );
    });
  }, [returns, filterType, search]);

  const pg = usePagination(filtered, 10);

  const typeBadge = (t) => t === 'sales' ? 'badge badge-amber' : 'badge badge-red';
  const resolutionBadge = (r) => {
    if (r === 'refund') return 'badge badge-red';
    if (r === 'credit') return 'badge badge-blue';
    if (r === 'exchange') return 'badge badge-green';
    return 'badge badge-gray';
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Returns</h1>
        <p className="text-sm text-slate-500 mt-1">
          Handle goods returned by customers or sent back to suppliers. Stock adjusts automatically.
        </p>
      </div>

      {error && (<div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>)}

      <form onSubmit={submit} className="card mb-6">
        <p className="card-title">New Return</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div><label>Reference</label>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required /></div>
          <div><label>Return Type</label>
            <select value={form.return_type} onChange={(e) => setForm({ ...form, return_type: e.target.value })}>
              <option value="sales">Sales Return — customer returns goods</option>
              <option value="purchase">Purchase Return — we return goods</option>
            </select></div>
          <div><label>Resolution</label>
            <select value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })}>
              <option value="credit">Credit / Debt adjustment</option>
              <option value="refund">Cash refund</option>
              <option value="exchange">Exchange (no cash)</option>
              <option value="pending">Pending</option>
            </select></div>
          <div><label>Party Name</label>
            <input placeholder="Customer or supplier" value={form.party_name}
              onChange={(e) => setForm({ ...form, party_name: e.target.value })} /></div>
          <div><label>Party Phone</label>
            <input value={form.party_phone} onChange={(e) => setForm({ ...form, party_phone: e.target.value })} /></div>
          <div><label>Original Ref</label>
            <input placeholder="SL-... or PO-..." value={form.original_reference}
              onChange={(e) => setForm({ ...form, original_reference: e.target.value })} /></div>
          <div className="md:col-span-2"><label>Reason</label>
            <input placeholder="e.g. defective part" value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div><label>Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Items</p>
            <button type="button" onClick={addItem} className="btn btn-secondary btn-sm">+ Add item</button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-5"><label className="md:hidden">Product</label>
                  <ProductPicker products={products} value={it.product} currency={currency}
                    onChange={(id, product) => {
                      updateItem(i, 'product', id);
                      if (product) {
                        updateItem(i, 'unit_price',
                          parseFloat(form.return_type === 'sales' ? product.selling_price : product.cost_price));
                      }
                    }} /></div>
                <div className="col-span-4 md:col-span-2"><label className="md:hidden">Qty</label>
                  <input type="number" min="1" value={it.quantity}
                    onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 0)} required /></div>
                <div className="col-span-4 md:col-span-2"><label className="md:hidden">Unit Price</label>
                  <input type="number" step="0.01" value={it.unit_price}
                    onChange={(e) => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)} required /></div>
                <div className="col-span-3 md:col-span-2 text-right"><label className="md:hidden">Subtotal</label>
                  <p className="py-2 text-sm font-semibold">{money((it.quantity || 0) * (it.unit_price || 0))}</p></div>
                <div className="col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3">
          <div><p className="text-xs text-slate-500 uppercase font-semibold">Return Total</p>
            <p className="text-2xl font-bold text-slate-900">{money(total)}</p></div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Clear</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Return'}
            </button>
          </div>
        </div>
      </form>

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2"><label>Search</label>
            <input placeholder="Reference, party, or original ref…"
              value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div><label>Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All</option>
              <option value="sales">Sales Returns</option>
              <option value="purchase">Purchase Returns</option>
            </select></div>
        </div>
      </div>

      <div className="table-wrap overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Reference</th><th>Date</th><th>Type</th><th>Party</th>
              <th>Original Ref</th><th>Resolution</th><th>By</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">No returns match your filters.</td></tr>
            )}
            {pg.pageItems.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.reference}</td>
                <td className="whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td><span className={typeBadge(r.return_type)}>{r.return_type}</span></td>
                <td className="font-medium">{r.party_name || '—'}</td>
                <td className="text-xs text-slate-500">{r.original_reference || '—'}</td>
                <td><span className={resolutionBadge(r.resolution)}>{r.resolution}</span></td>
                <td className="text-xs text-slate-500">{r.username || '—'}</td>
                <td className="text-right font-semibold">{money(r.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} goTo={pg.setPage}
        startIndex={pg.startIndex} endIndex={pg.endIndex}
        totalItems={filtered.length} label="returns" />
    </ProtectedRoute>
  );
}