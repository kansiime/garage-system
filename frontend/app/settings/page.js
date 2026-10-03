'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    tin: '',
    currency_code: 'UGX',
    currency_symbol: 'UGX',
    receipt_footer: '',
    whatsapp_template_debt: '',
    whatsapp_template_promise_today: '',
    whatsapp_template_receipt: '',
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
          whatsapp_template_debt: r.data.whatsapp_template_debt || '',
          whatsapp_template_promise_today: r.data.whatsapp_template_promise_today || '',
          whatsapp_template_receipt: r.data.whatsapp_template_receipt || '',
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
      toast.success('Settings saved');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      const status = err.response?.status;
      const msg = status === 403
        ? 'Only admin or manager can edit settings.'
        : 'Could not save. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, opts = {}) => (
    <div className={opts.full ? 'md:col-span-2' : ''}>
      <label>{label}</label>
      {opts.textarea ? (
        <textarea
          rows={opts.rows || 3}
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
          Business details shown on receipts, reports, and WhatsApp messages
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
        <form onSubmit={submit} className="space-y-6">
          {/* Business details */}
          <div className="card">
            <p className="card-title">Business Details</p>
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
          </div>

          {/* WhatsApp templates */}
          <div className="card">
            <p className="card-title">WhatsApp Message Templates</p>
            <p className="text-sm text-slate-500 mb-4">
              Customize the messages sent via WhatsApp. Use placeholders in curly braces — they'll
              be replaced automatically.
              <br />
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{name}'}</span>{' '}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{amount}'}</span>{' '}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{business}'}</span>{' '}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{reference}'}</span>{' '}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{paid}'}</span>{' '}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{balance}'}</span>{' '}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{promised_date}'}</span>{' '}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">{'{date}'}</span>
            </p>

            <div className="grid grid-cols-1 gap-4">
              {field(
                'whatsapp_template_debt',
                'Debt Reminder (sent to debtors)',
                { textarea: true, rows: 4, full: true }
              )}
              {field(
                'whatsapp_template_promise_today',
                'Promise Due Today (sent on the day they promised)',
                { textarea: true, rows: 4, full: true }
              )}
              {field(
                'whatsapp_template_receipt',
                'Sale Receipt (sent after a sale)',
                { textarea: true, rows: 6, full: true }
              )}
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg">
              <b>Tip:</b> Keep messages short and friendly. A typical reminder is:
              <em className="block mt-1 font-mono text-[11px] bg-white/60 p-2 rounded">
                Hello {'{name}'}, this is a friendly reminder about your outstanding balance of
                {' '}{'{amount}'} at {'{business}'}. Thank you.
              </em>
            </div>
          </div>

          <div className="flex justify-end">
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