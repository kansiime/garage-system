'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProductPicker from '@/components/ProductPicker';
import api from '@/lib/api';

export default function ReconciliationPage() {
  const [products, setProducts] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [form, setForm] = useState({ product: '', physical_quantity: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [p, r] = await Promise.all([
      api.get('/inventory/products/'),
      api.get('/inventory/reconciliations/'),
    ]);
    setProducts(p.data);
    setReconciliations(r.data);
  };
  useEffect(() => { load(); }, []);

  const selectedProduct = products.find((p) => String(p.id) === String(form.product));
  const physical = parseInt(form.physical_quantity) || 0;
  const diff = selectedProduct ? physical - selectedProduct.quantity : 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.product) {
      setError('Please select a product.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/inventory/reconciliations/', {
        product: parseInt(form.product),
        physical_quantity: physical,
        notes: form.notes,
      });
      setForm({ product: '', physical_quantity: '', notes: '' });
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save reconciliation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Stock Reconciliation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Compare system stock with physical count. Saving will sync the product's quantity.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="card mb-6">
        <p className="card-title">New Reconciliation</p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label>Product</label>
            <ProductPicker
              products={products}
              value={form.product}
              onChange={(id) => setForm({ ...form, product: id })}
              placeholder="Search product by name or SKU…"
              showPrice={false}
              showStock={true}
            />
          </div>
          <div className="md:col-span-2">
            <label>Physical Count</label>
            <input
              type="number"
              min="0"
              value={form.physical_quantity}
              onChange={(e) => setForm({ ...form, physical_quantity: e.target.value })}
              required
            />
          </div>
          <div className="md:col-span-3">
            <label>Notes (optional)</label>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Reason for discrepancy"
            />
          </div>
          <div className="md:col-span-2">
            <button className="btn btn-primary btn-block" disabled={saving}>
              {saving ? 'Saving…' : 'Reconcile'}
            </button>
          </div>
        </div>

        {selectedProduct && (
          <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap gap-6 text-sm">
            <span>
              Product: <b>{selectedProduct.name}</b>
            </span>
            <span>
              System: <b>{selectedProduct.quantity}</b>
            </span>
            <span>
              Physical: <b>{physical}</b>
            </span>
            <span>
              Difference:{' '}
              <b className={diff !== 0 ? 'text-red-600' : 'text-green-600'}>
                {diff > 0 ? '+' : ''}{diff}
              </b>
            </span>
          </div>
        )}
      </form>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th className="text-right">System</th>
              <th className="text-right">Physical</th>
              <th className="text-right">Difference</th>
              <th>Notes</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {reconciliations.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  No reconciliations recorded yet.
                </td>
              </tr>
            )}
            {reconciliations.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-slate-600">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="font-medium">{r.product_name}</td>
                <td className="text-right">{r.system_quantity}</td>
                <td className="text-right">{r.physical_quantity}</td>
                <td
                  className={`text-right font-semibold ${
                    r.difference !== 0 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {r.difference > 0 ? '+' : ''}{r.difference}
                </td>
                <td className="text-slate-500 text-sm">{r.notes || '—'}</td>
                <td className="text-sm">{r.username || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ProtectedRoute>
  );
}