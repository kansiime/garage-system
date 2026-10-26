'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useUser, can } from '@/lib/useUser';
import { useToast } from '@/components/Toast';

const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const emptyCount = { opening_cash: '', counted_cash: '', left_in_drawer: '', notes: '' };

export default function CashUpPage() {
  const user = useUser();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState(null);
  const [history, setHistory] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [count, setCount] = useState(emptyCount);
  const [saving, setSaving] = useState(false);

  const money = (n) => formatMoney(n, currency);
  const canCashUpDay = date === todayISO() || can.backdateCashUp(user);

  const load = async () => {
    const [d, h, gs] = await Promise.all([
      api.get(`/cashup/day/?date=${date}`),
      api.get('/cashup/'),
      api.get('/auth/settings/'),
    ]);
    setDay(d.data);
    setHistory(h.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
    setCount({ ...emptyCount, opening_cash: String(parseFloat(d.data.suggested_opening) || 0) });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  if (!day) {
    return <ProtectedRoute><p className="text-sm text-slate-500">Loading…</p></ProtectedRoute>;
  }

  const cash = day.methods.find((m) => m.method === 'cash');
  const opening = parseFloat(count.opening_cash) || 0;
  const expected = opening + parseFloat(cash.in) - parseFloat(cash.out);
  const counted = count.counted_cash === '' ? null : parseFloat(count.counted_cash);
  const saved = day.cash_up;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/cashup/', {
        date,
        opening_cash: opening,
        counted_cash: counted,
        left_in_drawer: parseFloat(count.left_in_drawer) || 0,
        notes: count.notes,
      });
      toast.success('Cash-up saved');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not save cash-up.'));
    } finally { setSaving(false); }
  };

  const redo = async () => {
    if (!confirm(`Delete the cash-up for ${date} so it can be done again?`)) return;
    try {
      await api.delete(`/cashup/${saved.id}/`);
      toast.success('Cash-up deleted');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Could not delete cash-up.'));
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cash-up</h1>
          <p className="text-sm text-slate-500 mt-1">
            Money in and out for the day by how it was paid. Count the cash drawer at closing and save it.
          </p>
        </div>
        <div><label>Day</label>
          <input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value || todayISO())} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {day.methods.map((m) => (
          <div key={m.method} className={`stat-card ${m.method === 'cash' ? 'green' : ''}`}>
            <p className="stat-label">{m.label}</p>
            <p className="stat-value">{money(m.net)}</p>
            <p className="text-xs text-slate-500 mt-1">
              In {money(m.in)} · Out {money(m.out)}
            </p>
          </div>
        ))}
      </div>

      {saved ? (
        <div className="card mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="card-title mb-0">Cash count for {saved.date}</p>
            <DifferenceBadge value={parseFloat(saved.difference)} money={money} />
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Row label="Opening cash" value={money(saved.opening_cash)} />
            <Row label="Cash in" value={`+ ${money(saved.cash_in)}`} />
            <Row label="Cash out" value={`− ${money(saved.cash_out)}`} />
            <Row label="Expected in drawer" value={money(saved.expected_cash)} />
            <Row label="Counted" value={money(saved.counted_cash)} strong />
            <Row label="Left in drawer" value={money(saved.left_in_drawer)} />
            <Row label="Taken / banked" value={money(parseFloat(saved.counted_cash) - parseFloat(saved.left_in_drawer))} />
            <Row label="Counted by" value={`${saved.recorded_by || '—'}, ${new Date(saved.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`} />
          </dl>
          {saved.notes && <p className="text-sm text-slate-600 mt-3"><b>Notes:</b> {saved.notes}</p>}
          {can.deleteCashUp(user) && (
            <div className="mt-4 flex justify-end">
              <button className="btn btn-secondary btn-sm" onClick={redo}>Delete and redo</button>
            </div>
          )}
        </div>
      ) : canCashUpDay ? (
        <form onSubmit={save} className="card mb-6">
          <p className="card-title">Count the cash drawer</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label>Opening cash</label>
              <input type="number" step="0.01" min="0" value={count.opening_cash}
                onChange={(e) => setCount({ ...count, opening_cash: e.target.value })} required />
              <p className="text-xs text-slate-400 mt-1">
                {day.previous_date ? `Left in the drawer on ${day.previous_date}` : 'Cash in the drawer when the day started'}
              </p></div>
            <div><label>Cash counted now</label>
              <input type="number" step="0.01" min="0" value={count.counted_cash} autoFocus
                onChange={(e) => setCount({ ...count, counted_cash: e.target.value })} required /></div>
            <div><label>Leaving in drawer for tomorrow</label>
              <input type="number" step="0.01" min="0" max={counted ?? undefined} placeholder="0"
                value={count.left_in_drawer}
                onChange={(e) => setCount({ ...count, left_in_drawer: e.target.value })} /></div>
            <div className="md:col-span-3"><label>Notes</label>
              <input placeholder="e.g. Short because change was given from pocket…" value={count.notes}
                onChange={(e) => setCount({ ...count, notes: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Expected: {money(opening)} + {money(cash.in)} − {money(cash.out)} = <b>{money(expected)}</b>
              {counted !== null && <> &nbsp;<DifferenceBadge value={counted - expected} money={money} /></>}
            </p>
            <button className="btn btn-primary" disabled={saving || counted === null}>
              {saving ? 'Saving…' : 'Save Cash-up'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">A saved cash-up cannot be changed.</p>
        </form>
      ) : (
        <div className="card mb-6 text-sm text-slate-500">This day has not been cashed up.</div>
      )}

      <div className="card mb-6">
        <p className="card-title">Money movements ({day.lines.length})</p>
        {day.lines.length === 0 ? (
          <p className="text-sm text-slate-400">No money in or out on this day.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time</th><th>What</th><th>Who</th><th>Reference</th><th>Paid by</th>
                  <th className="text-right">In</th><th className="text-right">Out</th>
                </tr>
              </thead>
              <tbody>
                {day.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="text-sm text-slate-600">{l.time}</td>
                    <td>{l.kind}</td>
                    <td className="text-sm">{l.party || '—'}</td>
                    <td className="font-mono text-xs">{l.reference || '—'}</td>
                    <td className="text-sm">{l.method_label}</td>
                    <td className="text-right text-green-700">{l.direction === 'in' ? money(l.amount) : ''}</td>
                    <td className="text-right text-red-600">{l.direction === 'out' ? money(l.amount) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="card">
          <p className="card-title">Recent cash-ups</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="text-right">Expected</th>
                  <th className="text-right">Counted</th>
                  <th className="text-right">Difference</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 30).map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDate(c.date)}>
                    <td>{c.date}</td>
                    <td className="text-right">{money(c.expected_cash)}</td>
                    <td className="text-right">{money(c.counted_cash)}</td>
                    <td className="text-right"><DifferenceBadge value={parseFloat(c.difference)} money={money} /></td>
                    <td className="text-sm text-slate-600">{c.recorded_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

function DifferenceBadge({ value, money }) {
  if (Math.abs(value) < 0.005) return <span className="badge badge-green">Balanced</span>;
  return value < 0
    ? <span className="badge badge-red">Short {money(-value)}</span>
    : <span className="badge badge-amber">Over {money(value)}</span>;
}

function Row({ label, value, strong = false }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={strong ? 'font-bold' : 'font-semibold'}>{value}</dd>
    </div>
  );
}
