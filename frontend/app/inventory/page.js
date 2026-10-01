'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState({
    name: '', sku: '', category: '', supplier: '',
    cost_price: '', selling_price: '', quantity: '', reorder_level: 5,
  });
  const [editing, setEditing] = useState(null);
  const [stockModal, setStockModal] = useState(null); // { product, quantity, notes, type }
  const [error, setError] = useState('');

  const load = async () => {
    const [p, c, s, gs] = await Promise.all([
      api.get('/inventory/products/'),
      api.get('/inventory/categories/'),
      api.get('/inventory/suppliers/'),
      api.get('/auth/settings/'),
    ]);
    setProducts(p.data); setCategories(c.data); setSuppliers(s.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) await api.put(`/inventory/products/${editing}/`, form);
      else await api.post('/inventory/products/', form);
      setForm({ name: '', sku: '', category: '', supplier: '', cost_price: '',
        selling_price: '', quantity: '', reorder_level: 5 });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.sku?.[0] || 'Could not save product.');
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this product?')) return;
    await api.delete(`/inventory/products/${id}/`);
    load();
  };

  const edit = (p) => {
    setEditing(p.id);
    setForm({
      name: p.name, sku: p.sku,
      category: p.category || '', supplier: p.supplier || '',
      cost_price: p.cost_price, selling_price: p.selling_price,
      quantity: p.quantity, reorder_level: p.reorder_level,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openStockModal = (product, type = 'in') => {
    setStockModal({ product, quantity: '', notes: '', type });
  };

  const submitStock = async (e) => {
    e.preventDefault();
    await api.post('/inventory/movements/', {
      product: stockModal.product.id,
      movement_type: stockModal.type,
      quantity: parseInt(stockModal.quantity),
      notes: stockModal.notes,
      reference: 'Manual adjustment',
    });
    setStockModal(null);
    load();
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">{products.length} product{products.length !== 1 && 's'}</p>
        </div>
        <a href="/suppliers" className="btn btn-secondary">Manage Suppliers & Categories</a>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      <form onSubmit={submit} className="card mb-6">
        <p className="card-title">{editing ? 'Edit Product' : 'Add Product'}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label>Product Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label>SKU / Code</label>
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </div>
          <div>
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label>Supplier</label>
            <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label>Cost Price</label>
            <input type="number" step="0.01" value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })} required />
          </div>
          <div>
            <label>Selling Price</label>
            <input type="number" step="0.01" value={form.selling_price}
              onChange={(e) => setForm({ ...form, selling_price: e.target.value })} required />
          </div>
          <div>
            <label>Opening Qty {editing && <span className="text-slate-400 normal-case font-normal">(use Add Stock to change)</span>}</label>
            <input type="number" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              disabled={!!editing} />
          </div>
          <div>
            <label>Reorder Level</label>
            <input type="number" value={form.reorder_level}
              onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {editing && (
            <button type="button" className="btn btn-secondary" onClick={() => {
              setEditing(null);
              setForm({ name: '', sku: '', category: '', supplier: '',
                cost_price: '', selling_price: '', quantity: '', reorder_level: 5 });
            }}>Cancel</button>
          )}
          <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Add'} Product</button>
        </div>
      </form>

      <div className="table-wrap overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>SKU</th><th>Name</th><th>Category</th><th>Supplier</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Sell</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr><td colSpan={8} className="text-center text-slate-400 py-8">No products yet — add your first one above.</td></tr>
            )}
            {products.map((p) => {
              const low = p.quantity <= p.reorder_level;
              return (
                <tr key={p.id} className={low ? 'bg-red-50/50' : ''}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.category_name || '—'}</td>
                  <td>{p.supplier_name || '—'}</td>
                  <td className="text-right">
                    <span className={low ? 'text-red-600 font-bold' : 'font-semibold'}>{p.quantity}</span>
                    {low && <span className="ml-2 badge badge-red">Low</span>}
                  </td>
                  <td className="text-right">{formatMoney(p.cost_price, currency)}</td>
                  <td className="text-right">{formatMoney(p.selling_price, currency)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-success btn-sm mr-1" onClick={() => openStockModal(p, 'in')}>+ Stock</button>
                    <button className="btn btn-secondary btn-sm mr-1" onClick={() => edit(p)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>Del</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stock Adjustment Modal */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-1">Adjust Stock</h3>
            <p className="text-sm text-slate-500 mb-4">
              {stockModal.product.name} — current stock <b>{stockModal.product.quantity}</b>
            </p>
            <form onSubmit={submitStock}>
              <div className="mb-3">
                <label>Action</label>
                <select value={stockModal.type} onChange={(e) => setStockModal({ ...stockModal, type: e.target.value })}>
                  <option value="in">Add to stock (+)</option>
                  <option value="out">Remove from stock (−)</option>
                  <option value="adjust">Set exact quantity</option>
                </select>
              </div>
              <div className="mb-3">
                <label>{stockModal.type === 'adjust' ? 'New quantity' : 'Quantity'}</label>
                <input type="number" required min="1" value={stockModal.quantity}
                  onChange={(e) => setStockModal({ ...stockModal, quantity: e.target.value })} />
              </div>
              <div className="mb-4">
                <label>Reason / Notes</label>
                <input value={stockModal.notes}
                  onChange={(e) => setStockModal({ ...stockModal, notes: e.target.value })}
                  placeholder="e.g. New delivery, damaged goods, correction" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setStockModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Apply</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}