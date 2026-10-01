'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '', tin: '',
    currency_code: 'UGX', currency_symbol: 'UGX', receipt_footer: '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/settings/').then((r) => setForm(r.data));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaved(false); setError('');
    try {
      await api.put('/auth/settings/', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save. Only admin/manager can edit settings.');
    }
  };

  const field = (name, label, opts = {}) => (
    <div className={opts.full ? 'md:col-span-2' : ''}>
      <label>{label}</label>
      {opts.textarea
        ? <textarea rows={3} value={form[name] || ''} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
        : <input type={opts.type || 'text'} value={form[name] || ''} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />}
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Garage Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Business details shown on receipts and reports</p>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
          ✓ Settings saved
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      <form onSubmit={submit} className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('name', 'Business Name', { full: true })}
          {field('address', 'Address', { textarea: true, full: true })}
          {field('phone', 'Phone')}
          {field('email', 'Email', { type: 'email' })}
          {field('tin', 'TIN')}
          {field('currency_code', 'Currency Code (e.g. UGX, KES, USD)')}
          {field('currency_symbol', 'Currency Symbol (shown on reports)')}
          {field('receipt_footer', 'Receipt Footer', { textarea: true, full: true })}
        </div>
        <div className="mt-6 flex justify-end">
          <button type="submit" className="btn btn-primary">Save Settings</button>
        </div>
      </form>
    </ProtectedRoute>
  );
}