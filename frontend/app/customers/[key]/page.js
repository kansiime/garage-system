'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const key = decodeURIComponent(params.key || '');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/customers/${encodeURIComponent(key)}/`)
      .then((r) => setData(r.data))
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

  const whatsappHref = data.phone
    ? `https://wa.me/${data.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `Hello ${data.name}, this is a friendly reminder about your outstanding balance of ${money(s.outstanding)}. Thank you.`
      )}`
    : null;

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
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noreferrer"
              className="btn btn-success">
              💬 WhatsApp
            </a>
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
        <Kpi label="Total Sales" value={s.sale_count} accent="" hint="Transactions" />
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
          <div className="table-wrap overflow-x-auto">
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
          <div className="table-wrap overflow-x-auto">
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
          <div className="table-wrap overflow-x-auto">
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