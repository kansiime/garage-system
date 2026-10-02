'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { usePagination } from '@/lib/usePagination';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sForm, setSForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [cForm, setCForm] = useState({ name: '', description: '' });
  const [editingS, setEditingS] = useState(null);
  const [error, setError] = useState('');

  // Supplier filters
  const [sSearch, setSSearch] = useState('');
  const [sPageSize, setSPageSize] = useState(10);

  // Category filters
  const [cSearch, setCSearch] = useState('');
  const [cPageSize, setCPageSize] = useState(10);

  const load = async () => {
    const [s, c] = await Promise.all([
      api.get('/inventory/suppliers/'),
      api.get('/inventory/categories/'),
    ]);
    setSuppliers(s.data);
    setCategories(c.data);
  };
  useEffect(() => { load(); }, []);

  const submitSupplier = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingS) await api.put(`/inventory/suppliers/${editingS}/`, sForm);
      else await api.post('/inventory/suppliers/', sForm);
      setSForm({ name: '', phone: '', email: '', address: '' });
      setEditingS(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save supplier.');
    }
  };

  const submitCategory = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/inventory/categories/', cForm);
      setCForm({ name: '', description: '' });
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save category.');
    }
  };

  const editSupplier = (s) => {
    setEditingS(s.id);
    setSForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '' });
  };

  const deleteSupplier = async (id) => {
    if (!confirm('Delete this supplier?')) return;
    try {
      await api.delete(`/inventory/suppliers/${id}/`);
      load();
    } catch {
      alert('Cannot delete — this supplier may be used by products.');
    }
  };

  const deleteCategory = async (id) => {
    if (!confirm('Delete this category?')) return;
    try {
      await api.delete(`/inventory/categories/${id}/`);
      load();
    } catch {
      alert('Cannot delete — this category may be used by products.');
    }
  };

  // --- Filtering ---
  const filteredSuppliers = useMemo(() => {
    const q = sSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q)
    );
  }, [suppliers, sSearch]);

  const filteredCategories = useMemo(() => {
    const q = cSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
    );
  }, [categories, cSearch]);

  // --- Pagination ---
  const sPg = usePagination(filteredSuppliers, sPageSize);
  const cPg = usePagination(filteredCategories, cPageSize);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Suppliers & Categories</h1>
        <p className="text-sm text-slate-500 mt-1">Manage who you buy from and how you group products</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ============ SUPPLIERS ============ */}
        <div>
          <form onSubmit={submitSupplier} className="card mb-4">
            <p className="card-title">{editingS ? 'Edit Supplier' : 'Add Supplier'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label>Name</label>
                <input value={sForm.name}
                  onChange={(e) => setSForm({ ...sForm, name: e.target.value })}
                  placeholder="e.g. Kagaba Investments"
                  required />
              </div>
              <div>
                <label>Phone</label>
                <input value={sForm.phone}
                  onChange={(e) => setSForm({ ...sForm, phone: e.target.value })}
                  placeholder="e.g. 0782176561 / 0765192072" />
              </div>
              <div>
                <label>Email</label>
                <input type="email" value={sForm.email}
                  onChange={(e) => setSForm({ ...sForm, email: e.target.value })}
                  placeholder="Optional" />
              </div>
              <div className="md:col-span-2">
                <label>Address</label>
                <textarea rows={2} value={sForm.address}
                  onChange={(e) => setSForm({ ...sForm, address: e.target.value })}
                  placeholder="e.g. Kijungu Mbarara" />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              {editingS && (
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setEditingS(null);
                  setSForm({ name: '', phone: '', email: '', address: '' });
                }}>Cancel</button>
              )}
              <button type="submit" className="btn btn-primary">
                {editingS ? '✓ Update' : '+ Add'} Supplier
              </button>
            </div>
          </form>

          {/* Supplier filters */}
          <div className="card mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label>Search suppliers</label>
                <input
                  placeholder="Search by name, phone, email, or address…"
                  value={sSearch}
                  onChange={(e) => setSSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label>Show per page</label>
                <select value={sPageSize} onChange={(e) => setSPageSize(parseInt(e.target.value))}>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            {sSearch && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-slate-600">
                  {filteredSuppliers.length} match{filteredSuppliers.length !== 1 ? 'es' : ''}
                </span>
                <button type="button" onClick={() => setSSearch('')}
                  className="btn btn-secondary btn-sm">✕ Clear search</button>
              </div>
            )}
          </div>

          <div className="table-wrap overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sPg.pageItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-slate-400 py-8">
                      {sSearch ? `No suppliers match "${sSearch}".` : 'No suppliers yet.'}
                    </td>
                  </tr>
                )}
                {sPg.pageItems.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td className="text-sm">{s.phone || '—'}</td>
                    <td className="text-sm text-slate-600 truncate max-w-[180px]">{s.email || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-secondary btn-sm mr-1" onClick={() => editSupplier(s)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteSupplier(s.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={sPg.page}
            totalPages={sPg.totalPages}
            goTo={sPg.setPage}
            startIndex={sPg.startIndex}
            endIndex={sPg.endIndex}
            totalItems={filteredSuppliers.length}
            label="suppliers"
          />
        </div>

        {/* ============ CATEGORIES ============ */}
        <div>
          <form onSubmit={submitCategory} className="card mb-4">
            <p className="card-title">Add Category</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label>Name</label>
                <input value={cForm.name}
                  onChange={(e) => setCForm({ ...cForm, name: e.target.value })}
                  placeholder="e.g. Tyres"
                  required />
              </div>
              <div>
                <label>Description</label>
                <input value={cForm.description}
                  onChange={(e) => setCForm({ ...cForm, description: e.target.value })}
                  placeholder="Optional" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-primary">+ Add Category</button>
            </div>
          </form>

          {/* Category filters */}
          <div className="card mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label>Search categories</label>
                <input
                  placeholder="Search by name or description…"
                  value={cSearch}
                  onChange={(e) => setCSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label>Show per page</label>
                <select value={cPageSize} onChange={(e) => setCPageSize(parseInt(e.target.value))}>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            {cSearch && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-slate-600">
                  {filteredCategories.length} match{filteredCategories.length !== 1 ? 'es' : ''}
                </span>
                <button type="button" onClick={() => setCSearch('')}
                  className="btn btn-secondary btn-sm">✕ Clear search</button>
              </div>
            )}
          </div>

          <div className="table-wrap overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cPg.pageItems.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-slate-400 py-8">
                      {cSearch ? `No categories match "${cSearch}".` : 'No categories yet.'}
                    </td>
                  </tr>
                )}
                {cPg.pageItems.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-slate-600 text-sm">{c.description || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-danger btn-sm" onClick={() => deleteCategory(c.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={cPg.page}
            totalPages={cPg.totalPages}
            goTo={cPg.setPage}
            startIndex={cPg.startIndex}
            endIndex={cPg.endIndex}
            totalItems={filteredCategories.length}
            label="categories"
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}