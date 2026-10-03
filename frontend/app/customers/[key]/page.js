'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { openWhatsApp, renderTemplate, DEFAULT_TEMPLATES } from '@/lib/whatsapp';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const key = decodeURIComponent(params.key || '');

  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/reports/customers/${encodeURIComponent(key)}/`),
      api.get('/auth/settings/'),
    ])
      .then(([cust, gs]) => {
        setData(cust.data);
        setSettings(gs.data);
      })
      .catch(() => setError('Could not load customer.'))
      .finally(() => setLoading(false));
  }, [key]);

  if (loading) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading customer…</p>
      </ProtectedRoute>
    );
  }

  if (error || !data) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">{error || 'Customer not found.'}</p>
          <button className="btn btn-secondary mt-4" onClick={() => router.push('/customers')}>
            ← Back to Customers
          </button>
        </div>
      </ProtectedRoute>
    );
  }

  const money = (n) => formatMoney(n, data.currency);
  const s = data.summary;

  const sendWhatsApp = () => {
    if (!data.phone) {
      toast.warning('This customer has no phone number on file.');
      return;
    }
    const template = settings.whatsapp_template_debt || DEFAULT_TEMPLATES.debt_reminder;
    const message = renderTemplate(template, {
      name: data.name,
      amount: money(s.outstanding),
      business: settings.name || 'our garage',
      promised_date: 'soon',
    });
    openWhatsApp(data.phone, message);
    toast.success(`Opening WhatsApp for ${data.name}…`);
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => router.push('/customers')}
            className="text-sm text-slate-500 hover:text-slate-800 mb-1"
          >
            ← Back to Customers
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data.phone ? `📞 ${data.phone}` : 'No phone on file'}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {data.phone && (
            <button onClick={sendWhatsApp} className="btn btn-success">
              💬 WhatsApp
            </button>
          )}
          {data.phone && (
            <a href={`tel:${data.phone}`} className="btn btn-secondary">
              📞 Call
            </a>
          )}
          <Link href="/debts" className="btn btn-secondary">
            View in Debts →
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Sales" value={s.sale_count} hint="Transactions" />
        <Kpi label="Lifetime Spent" value={money(s.total_spent)} accent="green" hint="Sum of all sales" />
        <Kpi label="Outstanding" value={money(s.outstanding)} accent={s.outstanding > 0 ? 'red' : ''} hint="Current balance owed" />
        <Kpi label="Paid on Debts" value={money(s.total_paid_on_debts)} accent="amber" hint="Total debt payments" />
      </div>

      {/* Debts */}
      <div className="card mb-6">
        <p className="card-title">Debts ({data.debts.length})</p>
        {data.debts.length === 0 ? (
          <p className="text-sm text-slate-400">No debts — all paid up.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th>Promised</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.debts.map((d) => (
                  <tr key={d.id}>
                    <td className="text-sm text-slate-600 whitespace-nowrap">{d.created_at}</td>
                    <td className="font-mono text-xs">{d.reference || '—'}</td>
                    <td className="text-right">{money(d.amount)}</td>
                    <td className="text-right">{money(d.paid)}</td>
                    <td className={`text-right font-semibold ${d.balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {money(d.balance)}
                    </td>
                    <td className="text-sm">
                      {d.promised_date || '—'}
                      {d.promise_status === 'overdue' && (
                        <span className="ml-2 badge badge-red">Overdue</span>
                      )}
                      {d.promise_status === 'due_today' && (
                        <span className="ml-2 badge badge-amber">Due today</span>
                      )}
                    </td>
                    <td>
                      <span className={
                        d.status === 'paid' ? 'badge badge-green'
                        : d.status === 'partial' ? 'badge badge-amber'
                        : 'badge badge-red'
                      }>
                        {d.status}
                      </span>
                    </td>
                    <td className="text-right">
                      {data.phone && d.balance > 0 && (
                        <button className="btn btn-success btn-sm"
                          onClick={() => {
                            const template = settings.whatsapp_template_debt || DEFAULT_TEMPLATES.debt_reminder;
                            const msg = renderTemplate(template, {
                              name: data.name,
                              amount: money(d.balance),
                              business: settings.name || 'our garage',
                              promised_date: d.promised_date || 'soon',
                            });
                            openWhatsApp(data.phone, msg);
                            toast.success(`Reminder sent to ${data.name}`);
                          }}
                          title="Send WhatsApp reminder for this debt">
                          💬
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment history */}
      {data.payments.length > 0 && (
        <div className="card mb-6">
          <p className="card-title">Payment History ({data.payments.length})</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="text-sm text-slate-600 whitespace-nowrap">{p.date}</td>
                    <td className="text-right font-semibold text-green-700">{money(p.amount)}</td>
                    <td className="text-sm text-slate-500">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sales history */}
      <div className="card">
        <p className="card-title">Sales History ({data.sales.length})</p>
        {data.sales.length === 0 ? (
          <p className="text-sm text-slate-400">No sales recorded.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Payment</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="text-sm text-slate-600 whitespace-nowrap">{sale.date}</td>
                    <td className="font-mono text-xs">{sale.reference}</td>
                    <td className="capitalize">{sale.payment_type}</td>
                    <td className="text-right font-medium">{money(sale.total)}</td>
                    <td className="text-right">{money(sale.paid)}</td>
                    <td className={`text-right ${sale.balance > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                      {money(sale.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

function Kpi({ label, value, accent = '', hint }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}