'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { apiError } from '@/lib/api';
import { useUser, can } from '@/lib/useUser';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { openWhatsApp, renderTemplate, DEFAULT_TEMPLATES } from '@/lib/whatsapp';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const user = useUser();
  const id = params.id;

  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [merging, setMerging] = useState(null);

  const load = () => Promise.all([
    api.get(`/customers/${id}/`),
    api.get('/auth/settings/'),
  ])
    .then(([cust, gs]) => {
      setData(cust.data);
      setSettings(gs.data);
    })
    .catch(() => setError('Could not load customer.'))
    .finally(() => setLoading(false));

  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [id]);

  // Search for the duplicate to merge in
  useEffect(() => {
    const q = (merging?.search || '').trim();
    if (!merging || q.length < 2) return;
    const t = setTimeout(() => {
      api.get(`/customers/?search=${encodeURIComponent(q)}`)
        .then((res) => setMerging((m) => m && ({
          ...m, results: res.data.customers.filter((c) => String(c.id) !== String(id)),
        })));
    }, 250);
    return () => clearTimeout(t);
  }, [merging?.search, id]);

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

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/customers/${id}/`, editing);
      toast.success('Customer updated');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not update customer.'));
    }
  };

  const mergeIn = async (other) => {
    if (!confirm(`Merge "${other.name}" into "${data.name}"?\n\nTheir sales, debts and notes move here and "${other.name}" is removed. This cannot be undone.`)) return;
    try {
      const res = await api.post(`/customers/${id}/merge/`, { other: other.id });
      setData(res.data);
      setMerging(null);
      toast.success(`${other.name} merged into ${data.name}`);
    } catch (err) {
      toast.error(apiError(err, 'Could not merge customers.'));
    }
  };

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
          {data.notes && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{data.notes}</p>}
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
          {can.editCustomers(user) && (
            <button className="btn btn-secondary"
              onClick={() => setEditing({ name: data.name, phone: data.phone || '', notes: data.notes || '' })}>
              ✏️ Edit
            </button>
          )}
          {can.editCustomers(user) && (
            <button className="btn btn-secondary" onClick={() => setMerging({ search: '', results: [] })}>
              🔗 Merge duplicate
            </button>
          )}
          <Link href={`/debts?search=${encodeURIComponent(data.phone || data.name)}`} className="btn btn-secondary">
            View in Debts →
          </Link>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={saveEdit} className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-4">Edit Customer</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label>Name</label>
                <input value={editing.name} required
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label>Phone</label>
                <input value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div className="md:col-span-2"><label>Notes</label>
                <textarea rows={3} value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Their debts update too. Past sales keep the details they were made with.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}

      {merging && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setMerging(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Merge a duplicate into {data.name}</h3>
            <p className="text-sm text-slate-500 mb-4">
              Find the same person entered under another name or number. Everything of theirs moves to {data.name}.
            </p>
            <input placeholder="Search name or phone…" autoFocus value={merging.search}
              onChange={(e) => setMerging({ ...merging, search: e.target.value })} />
            <ul className="mt-3 max-h-72 overflow-y-auto divide-y divide-slate-100">
              {merging.search.trim().length >= 2 && merging.results.length === 0 && (
                <li className="py-2 text-sm text-slate-400">No other customers found.</li>
              )}
              {merging.results.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.phone || 'No phone'} · {c.sale_count} sale{c.sale_count !== 1 && 's'}
                      {c.balance > 0 && ` · owes ${money(c.balance)}`}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => mergeIn(c)}>Merge in</button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-secondary" onClick={() => setMerging(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

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

      {/* Follow-up notes */}
      {data.follow_ups?.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="card-title mb-0">Follow-up Notes ({data.follow_ups.length})</p>
            <Link href={`/debts?search=${encodeURIComponent(data.phone || data.name)}`} className="text-sm text-blue-700 hover:underline">
              Add a note →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.follow_ups.map((f) => (
              <li key={f.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{f.contacted_on} · {f.method_display}</span>
                  {f.promised_date && <span className="badge badge-amber">Promised {f.promised_date}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{f.note}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Logged {f.logged_at}{f.recorded_by && ` by ${f.recorded_by}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                  <th>Paid by</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="text-sm text-slate-600 whitespace-nowrap">{p.date}</td>
                    <td className="text-right font-semibold text-green-700">{money(p.amount)}</td>
                    <td className="text-sm">{p.method_display}</td>
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