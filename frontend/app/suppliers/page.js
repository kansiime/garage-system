'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sForm, setSForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [cForm, setCForm] = useState({ name: '', description: '' });
  const [editingS, setEditingS] = useState(null);

  const load = async () => {
    const [s, c] = await Promise.all([
      api.get('/inventory/suppliers/'),
      api.get('/inventory/categories/'),
    ]);
    setSuppliers(s.data); setCategories(c.data);
  };
  useEffect(() => { load(); }, []);

  const submitSupplier = async (e) => {
    e.preventDefault();
    if (editingS) await api.put(`/inventory/suppliers/${editingS}/`, sForm);
    else await api.post('/inventory/suppliers/', sForm);
    setSForm({ name: '', phone: '', email: '', address: '' });
    setEditingS(null);
    load();
  };

  const submitCategory = async (e) => {
    e.preventDefault();
    await api.post('/inventory/categories/', cForm);
    setCForm({ name: '', description: '' });
    load();
  };

  const editSupplier = (s) => {
    setEditingS(s.id);
    setSForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '' });
  };

  const deleteSupplier = async (id) => {
    if (!confirm('Delete this supplier?')) return;
    await api.delete(`/inventory/suppliers/${id}/`);
    load();
  };

  const deleteCategory = async (id) => {
    if (!confirm('Delete this category?')) return;
    await api.delete(`/inventory/categories/${id}/`);
    load();
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Suppliers & Categories</h1>
        <p className="text-sm text-slate-500 mt-1">Manage who you buy from and how you group products</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Suppliers */}
        <div>
          <form onSubmit={submitSupplier} className="card mb-4">
            <p className="card-title">{editingS ? 'Edit Supplier' : 'Add Supplier'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label>Name</label>
                <input value={sForm.name} onChange={(e) => setSForm({ ...sForm, name: e.target.value })} required />
              </div>
              <div>
                <label>Phone</label>
                <input value={sForm.phone} onChange={(e) => setSForm({ ...sForm, phone: e.target.value })} />
              </div>
              <div>
                <label>Email</label>
                <input type="email" value={sForm.email} onChange={(e) => setSForm({ ...sForm, email: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label>Address</label>
                <textarea rows={2} value={sForm.address} onChange={(e) => setSForm({ ...sForm, address: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              {editingS && (
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setEditingS(null);
                  setSForm({ name: '', phone: '', email: '', address: '' });
                }}>Cancel</button>
              )}
              <button type="submit" className="btn btn-primary">{editingS ? 'Update' : 'Add'} Supplier</button>
            </div>
          </form>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead>
              <tbody>
                {suppliers.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-slate-400 py-6">No suppliers yet</td></tr>
                )}
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-secondary btn-sm mr-1" onClick={() => editSupplier(s)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteSupplier(s.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Categories */}
        <div>
          <form onSubmit={submitCategory} className="card mb-4">
            <p className="card-title">Add Category</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label>Name</label>
                <input value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} required />
              </div>
              <div>
                <label>Description</label>
                <input value={cForm.description} onChange={(e) => setCForm({ ...cForm, description: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-primary">Add Category</button>
            </div>
          </form>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Description</th><th></th></tr></thead>
              <tbody>
                {categories.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-slate-400 py-6">No categories yet</td></tr>
                )}
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.description || '—'}</td>
                    <td className="text-right">
                      <button className="btn btn-danger btn-sm" onClick={() => deleteCategory(c.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}