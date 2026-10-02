'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currency, setCurrency] = useState('UGX');

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const q = new URLSearchParams();
    if (filterStart) q.set('start', filterStart);
    if (filterEnd) q.set('end', filterEnd);
    if (filterCategory) q.set('category', filterCategory);
    if (search) q.set('search', search);
    const [e, c, gs] = await Promise.all([
      api.get(`/expenses/?${q.toString()}`),
      api.get('/expenses/categories/'),
      api('/auth/settings/'),
    ]);
    setExpenses(e.data);
    setCategories(c.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterStart, filterEnd, filterCategory, search]);

  const money = (n) => formatMoney(n, currency);
  const total = useMemo(() => expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0), [expenses]);

  const pg = usePagination(expenses, 10);

  const openCreate = () => {
    setError('');
    setModal({ mode: 'create', description: '', amount: '', category: '',
      payment_method: 'cash', reference: '', notes: '',
      expense_date: new Date().toISOString().slice(0, 10) });
  };
  const openEdit = (expense) => {
    setError('');
    setModal({ mode: 'edit', id: expense.id, description: expense.description,
      amount: expense.amount, category: expense.category || '',
      payment_method: expense.payment_method, reference: expense.reference || '',
      notes: expense.notes || '', expense_date: expense.expense_date });
  };

  const saveExpense = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        description: modal.description, amount: modal.amount,
        category: modal.category || null, payment_method: modal.payment_method,
        reference: modal.reference, notes: modal.notes, expense_date: modal.expense_date,
      };
      if (modal.mode === 'edit') await api.put(`/expenses/${modal.id}/`, payload);
      else await api.post('/expenses/', payload);
      setModal(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save expense.');
    }
  };

  const deleteExpense = async (id) => {
    if (!confirm('Delete this expense?')) return;
    await api.delete(`/expenses/${id}/`);
    load();
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    await api.post('/expenses/categories/', { name: newCategory.trim() });
    setNewCategory('');
    load();
  };
  const deleteCategory = async (id) => {
    if (!confirm('Delete category?')) return;
    await api.delete(`/expenses/categories/${id}/`);
    load();
  };
  const resetFilters = () => {
    setFilterStart(''); setFilterEnd(''); setFilterCategory(''); setSearch('');
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-sm text-slate-500 mt-1">Rent, salaries, utilities, fuel and other operating costs.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setCatModal(true)}>Manage Categories</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Expense</button>
        </div>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><label>From</label>
            <input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} /></div>
          <div><label>To</label>
            <input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} /></div>
          <div><label>Category</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="md:col-span-2"><label>Search</label>
            <input placeholder="Search description…"
              value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
        <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
          <p className="text-sm text-slate-600">
            {expenses.length} expense{expenses.length !== 1 && 's'} — total <b className="text-slate-900">{money(total)}</b>
          </p>
          <button onClick={resetFilters} className="btn btn-secondary btn-sm">Reset filters</button>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Description</th><th>Category</th><th>Method</th>
              <th>Reference</th>
              <th className="text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-8">No expenses match your filters.</td></tr>
            )}
            {pg.pageItems.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-slate-600">{e.expense_date}</td>
                <td className="font-medium">{e.description}</td>
                <td>{e.category_name || '—'}</td>
                <td className="capitalize">{e.payment_method_display || e.payment_method}</td>
                <td className="text-xs text-slate-500">{e.reference || '—'}</td>
                <td className="text-right font-semibold">{money(e.amount)}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn btn-secondary btn-sm mr-1" onClick={() => openEdit(e)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteExpense(e.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} goTo={pg.setPage}
        startIndex={pg.startIndex} endIndex={pg.endIndex}
        totalItems={expenses.length} label="expenses" />

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-4">{modal.mode === 'edit' ? 'Edit Expense' : 'Add Expense'}</h3>
            {error && (<div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded">{error}</div>)}
            <form onSubmit={saveExpense}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2"><label>Description</label>
                  <input value={modal.description} required
                    onChange={(ev) => setModal({ ...modal, description: ev.target.value })} /></div>
                <div><label>Amount</label>
                  <input type="number" step="0.01" min="0" value={modal.amount} required
                    onChange={(ev) => setModal({ ...modal, amount: ev.target.value })} /></div>
                <div><label>Date</label>
                  <input type="date" value={modal.expense_date} required
                    onChange={(ev) => setModal({ ...modal, expense_date: ev.target.value })} /></div>
                <div><label>Category</label>
                  <select value={modal.category} onChange={(ev) => setModal({ ...modal, category: ev.target.value })}>
                    <option value="">— None —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label>Payment Method</label>
                  <select value={modal.payment_method} onChange={(ev) => setModal({ ...modal, payment_method: ev.target.value })}>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="mobile">Mobile Money</option>
                    <option value="card">Card</option>
                    <option value="credit">Credit (unpaid)</option>
                  </select></div>
                <div className="md:col-span-2"><label>Reference (optional)</label>
                  <input value={modal.reference} onChange={(ev) => setModal({ ...modal, reference: ev.target.value })} /></div>
                <div className="md:col-span-2"><label>Notes (optional)</label>
                  <textarea rows={2} value={modal.notes}
                    onChange={(ev) => setModal({ ...modal, notes: ev.target.value })} /></div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {modal.mode === 'edit' ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {catModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Expense Categories</h3>
            <form onSubmit={addCategory} className="flex gap-2 mb-4">
              <input placeholder="New category name" value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)} />
              <button className="btn btn-primary">Add</button>
            </form>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
              {categories.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-4">No categories yet.</p>
              )}
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-b-0">
                  <span className="text-sm">{c.name}</span>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteCategory(c.id)}>✕</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-secondary" onClick={() => setCatModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}