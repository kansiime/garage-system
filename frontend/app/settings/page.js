'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    tin: '',
    currency_code: 'UGX',
    currency_symbol: 'UGX',
    receipt_footer: '',
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/auth/settings/')
      .then((r) => {
        setForm({
          name: r.data.name || '',
          address: r.data.address || '',
          phone: r.data.phone || '',
          email: r.data.email || '',
          tin: r.data.tin || '',
          currency_code: r.data.currency_code || 'UGX',
          currency_symbol: r.data.currency_symbol || 'UGX',
          receipt_footer: r.data.receipt_footer || '',
        });
        setLoaded(true);
      })
      .catch(() => {
        setError('Could not load settings.');
        setLoaded(true);
      });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaved(false);
    setError('');
    setSaving(true);
    try {
      await api.put('/auth/settings/', form);
      setSaved(true);
      // Reload the page after 1s so the navbar picks up the new business name
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        setError('Only admin or manager can edit settings.');
      } else {
        setError('Could not save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, opts = {}) => (
    <div className={opts.full ? 'md:col-span-2' : ''}>
      <label>{label}</label>
      {opts.textarea ? (
        <textarea
          rows={3}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      ) : (
        <input
          type={opts.type || 'text'}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      )}
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Garage Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Business details shown on receipts and reports
        </p>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
          ✓ Settings saved — reloading…
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {!loaded ? (
        <div className="card">
          <p className="text-slate-500 text-sm">Loading settings…</p>
        </div>
      ) : (
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
            <button
              type="submit"
              className="btn btn-primary flex items-center gap-2"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>
      )}
    </ProtectedRoute>
  );
}