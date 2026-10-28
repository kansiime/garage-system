'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { apiError } from '@/lib/api';
import { formatMoney, localDate } from '@/lib/format';
import { useUser, can } from '@/lib/useUser';
import { useToast } from '@/components/Toast';
import { openWhatsApp } from '@/lib/whatsapp';

// Matches DENOMINATIONS / CHECKED_ACCOUNTS in backend/apps/cashup/serializers.py
const DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];
const CHECKED_ACCOUNTS = [
  { method: 'mobile', label: 'Mobile Money' },
  { method: 'bank', label: 'Bank' },
];

const emptyCount = {
  opening_cash: '', counted_cash: '', left_in_drawer: '', banked: '', to_owner: '', notes: '',
};

const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
};
const prettyDate = (iso) => new Date(`${iso}T00:00:00`)
  .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const num = (v) => parseFloat(v) || 0;
const differs = (a, b) => Math.abs(a - b) > 0.005;

export default function CashUpPage() {
  const user = useUser();
  const toast = useToast();
  const [date, setDate] = useState(localDate());
  const [day, setDay] = useState(null);
  const [history, setHistory] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [garageName, setGarageName] = useState('');
  const [count, setCount] = useState(emptyCount);
  const [byNotes, setByNotes] = useState(false);
  const [notes, setNotes] = useState({});
  const [accounts, setAccounts] = useState({});
  const [saving, setSaving] = useState(false);

  const today = localDate();
  const money = (n) => formatMoney(n, currency);
  const canCashUpDay = date === today || can.backdateCashUp(user);

  const load = async () => {
    const [d, h, gs] = await Promise.all([
      api.get(`/cashup/day/?date=${date}`),
      api.get('/cashup/'),
      api.get('/auth/settings/'),
    ]);
    setDay(d.data);
    setHistory(h.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
    setGarageName(gs.data.name || '');
    setCount({ ...emptyCount, opening_cash: String(num(d.data.suggested_opening)) });
    setNotes({});
    const suggested = d.data.suggested_accounts || {};
    setAccounts(Object.fromEntries(CHECKED_ACCOUNTS.map(({ method }) => [
      method, { opening: suggested[method] != null ? String(suggested[method]) : '', counted: '' },
    ])));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  if (!day) {
    return <ProtectedRoute><p className="text-sm text-slate-500">Loading…</p></ProtectedRoute>;
  }

  const cash = day.methods.find((m) => m.method === 'cash');
  const opening = num(count.opening_cash);
  const expected = opening + num(cash.in) - num(cash.out);
  const notesTotal = DENOMINATIONS.reduce((s, d) => s + d * (parseInt(notes[d]) || 0), 0);
  const counted = byNotes
    ? (notesTotal || null)
    : (count.counted_cash === '' ? null : num(count.counted_cash));
  const taken = Math.max(0, (counted || 0) - num(count.left_in_drawer));
  const otherTaken = taken - num(count.banked) - num(count.to_owner);
  const saved = day.cash_up;
  const missed = day.missed || [];

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/cashup/', {
        date,
        opening_cash: opening,
        counted_cash: counted,
        left_in_drawer: num(count.left_in_drawer),
        banked: num(count.banked),
        to_owner: num(count.to_owner),
        denominations: byNotes
          ? Object.fromEntries(DENOMINATIONS.filter((d) => parseInt(notes[d]) > 0)
            .map((d) => [d, parseInt(notes[d])]))
          : {},
        accounts: Object.fromEntries(Object.entries(accounts)
          .filter(([, a]) => a.counted !== '')
          .map(([m, a]) => [m, { opening: num(a.opening), counted: num(a.counted) }])),
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

  const sendSummary = () => {
    const diff = num(saved.difference);
    const diffText = Math.abs(diff) < 0.005 ? 'Balanced' : diff < 0 ? `SHORT ${money(-diff)}` : `Over ${money(diff)}`;
    const lines = [
      `*Cash-up ${prettyDate(saved.date)}*${garageName ? ` — ${garageName}` : ''}`,
      '',
      `Cash expected: ${money(saved.expected_cash)}`,
      `Cash counted: ${money(saved.counted_cash)} (${diffText})`,
      `Left in drawer: ${money(saved.left_in_drawer)}`,
      num(saved.banked) > 0 ? `Banked: ${money(saved.banked)}` : null,
      num(saved.to_owner) > 0 ? `Given to owner: ${money(saved.to_owner)}` : null,
      '',
      ...day.methods.filter((m) => num(m.in) || num(m.out))
        .map((m) => `${m.label}: in ${money(m.in)}, out ${money(m.out)}`),
      ...CHECKED_ACCOUNTS.filter(({ method }) => saved.accounts?.[method]).map(({ method, label }) => {
        const a = saved.accounts[method];
        return `${label} balance: ${money(a.counted)} (expected ${money(a.expected)})`;
      }),
      saved.notes ? `\nNotes: ${saved.notes}` : null,
      `\nCounted by ${saved.recorded_by || '—'}`,
    ];
    openWhatsApp('', lines.filter((l) => l !== null).join('\n'));
  };

  // Short/over per person for the month of the selected day
  const month = date.slice(0, 7);
  const byPerson = Object.values(history
    .filter((c) => c.date.startsWith(month))
    .reduce((acc, c) => {
      const who = c.recorded_by || '—';
      const p = acc[who] || (acc[who] = { who, days: 0, short: 0, over: 0 });
      const d = num(c.difference);
      p.days += 1;
      if (d < 0) p.short += -d; else p.over += d;
      return acc;
    }, {}))
    .sort((a, b) => b.short - a.short);

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cash-up</h1>
          <p className="text-sm text-slate-500 mt-1">
            Money in and out for the day by how it was paid. Count the cash drawer at closing and save it.
          </p>
        </div>
        <div>
          <label>Day</label>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-secondary btn-sm" title="Previous day"
              onClick={() => setDate(shiftDate(date, -1))}>◀</button>
            <input type="date" max={today} value={date} className="w-auto"
              onChange={(e) => setDate(e.target.value || today)} />
            <button type="button" className="btn btn-secondary btn-sm" title="Next day"
              disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))}>▶</button>
            {date === today
              ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDate(shiftDate(today, -1))}>Yesterday</button>
              : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDate(today)}>Today</button>}
          </div>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-semibold mb-2">
            {missed.length === 1 ? '1 earlier day was' : `${missed.length} earlier days were`} not cashed up
          </p>
          <div className="flex flex-wrap gap-2">
            {missed.map((d) => (
              <button key={d} type="button" onClick={() => setDate(d)}
                className={`px-2 py-1 rounded border text-xs ${d === date ? 'bg-amber-200 border-amber-400' : 'bg-white border-amber-300 hover:bg-amber-100'}`}>
                {prettyDate(d)}
              </button>
            ))}
          </div>
          {!can.backdateCashUp(user) && (
            <p className="text-xs mt-2">Only an admin or manager can cash up an earlier day.</p>
          )}
        </div>
      )}

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
          {day.changes.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
              <p className="font-semibold">Changed after this cash-up was saved</p>
              <p className="text-xs mb-2">
                Something was added or removed for this day after it was counted, so the figures below no longer match.
                {can.deleteCashUp(user) ? ' Delete and redo the cash-up to count it again.' : ' Ask an admin to redo it.'}
              </p>
              <ul className="space-y-0.5">
                {day.changes.map((c) => (
                  <li key={c.method}>
                    <b>{c.label}:</b>
                    {differs(c.in_now, c.in_then) && <> in {money(c.in_then)} → {money(c.in_now)}</>}
                    {differs(c.in_now, c.in_then) && differs(c.out_now, c.out_then) && ','}
                    {differs(c.out_now, c.out_then) && <> out {money(c.out_then)} → {money(c.out_now)}</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="card-title mb-0">Cash count for {saved.date}</p>
            <DifferenceBadge value={num(saved.difference)} money={money} />
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Row label="Opening cash" value={money(saved.opening_cash)} />
            <Row label="Cash in" value={`+ ${money(saved.cash_in)}`} />
            <Row label="Cash out" value={`− ${money(saved.cash_out)}`} />
            <Row label="Expected in drawer" value={money(saved.expected_cash)} />
            <Row label="Counted" value={money(saved.counted_cash)} strong />
            <Row label="Left in drawer" value={money(saved.left_in_drawer)} />
            <Row label="Banked" value={money(saved.banked)} />
            <Row label="Given to owner" value={money(saved.to_owner)} />
            {(() => {
              const other = num(saved.counted_cash) - num(saved.left_in_drawer) - num(saved.banked) - num(saved.to_owner);
              return other > 0.005 ? <Row label="Taken, not said where" value={money(other)} /> : null;
            })()}
            {CHECKED_ACCOUNTS.filter(({ method }) => saved.accounts?.[method]).map(({ method, label }) => {
              const a = saved.accounts[method];
              return (
                <div key={method} className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">{label} balance</dt>
                  <dd className="font-semibold">{money(a.counted)}</dd>
                  <dd className="text-xs text-slate-500 mt-0.5">
                    expected {money(a.expected)} <DifferenceBadge value={a.difference} money={money} />
                  </dd>
                </div>
              );
            })}
            <Row label="Counted by" value={`${saved.recorded_by || '—'}, ${new Date(saved.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`} />
          </dl>
          {Object.keys(saved.denominations || {}).length > 0 && (
            <p className="text-xs text-slate-500 mt-3">
              <b>Notes and coins:</b>{' '}
              {DENOMINATIONS.filter((d) => saved.denominations[d])
                .map((d) => `${saved.denominations[d]} × ${d.toLocaleString()}`).join(' · ')}
            </p>
          )}
          {saved.notes && <p className="text-sm text-slate-600 mt-3"><b>Notes:</b> {saved.notes}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={sendSummary}>Send on WhatsApp</button>
            {can.deleteCashUp(user) && (
              <button className="btn btn-secondary btn-sm" onClick={redo}>Delete and redo</button>
            )}
          </div>
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
            <div>
              <div className="flex items-center justify-between">
                <label>Cash counted now</label>
                <button type="button" className="text-xs text-blue-600 hover:underline mb-1"
                  onClick={() => setByNotes(!byNotes)}>
                  {byNotes ? 'Type one total' : 'Count notes & coins'}
                </button>
              </div>
              {byNotes
                ? <p className="py-2 text-lg font-bold">{money(notesTotal)}</p>
                : <input type="number" step="0.01" min="0" value={count.counted_cash} autoFocus
                    onChange={(e) => setCount({ ...count, counted_cash: e.target.value })} required />}
            </div>
            <div><label>Leaving in drawer for tomorrow</label>
              <input type="number" step="0.01" min="0" max={counted ?? undefined} placeholder="0"
                value={count.left_in_drawer}
                onChange={(e) => setCount({ ...count, left_in_drawer: e.target.value })} /></div>

            {byNotes && (
              <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-lg bg-slate-50">
                {DENOMINATIONS.map((d) => (
                  <div key={d}>
                    <label className="text-xs">{d.toLocaleString()} × </label>
                    <input type="number" min="0" step="1" inputMode="numeric" placeholder="0"
                      value={notes[d] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [d]: e.target.value })} />
                    <p className="text-xs text-slate-400 mt-0.5">
                      {(parseInt(notes[d]) || 0) > 0 ? money(d * parseInt(notes[d])) : ' '}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {taken > 0 && (
              <div className="md:col-span-3">
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  Where the {money(taken)} taken out went
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label>Banked</label>
                    <input type="number" step="0.01" min="0" placeholder="0" value={count.banked}
                      onChange={(e) => setCount({ ...count, banked: e.target.value })} /></div>
                  <div><label>Given to owner</label>
                    <input type="number" step="0.01" min="0" placeholder="0" value={count.to_owner}
                      onChange={(e) => setCount({ ...count, to_owner: e.target.value })} /></div>
                  <div><label>Other / not said</label>
                    <p className={`py-2 font-semibold ${otherTaken < 0 ? 'text-red-600' : ''}`}>
                      {otherTaken < 0 ? `${money(-otherTaken)} too much` : money(otherTaken)}
                    </p></div>
                </div>
              </div>
            )}

            <div className="md:col-span-3">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                Check other balances <span className="font-normal text-slate-400">(optional)</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CHECKED_ACCOUNTS.map(({ method, label }) => {
                  const a = accounts[method] || { opening: '', counted: '' };
                  const m = day.methods.find((x) => x.method === method);
                  const accExpected = num(a.opening) + num(m?.net);
                  const set = (field, v) => setAccounts({ ...accounts, [method]: { ...a, [field]: v } });
                  return (
                    <div key={method} className="p-3 rounded-lg bg-slate-50">
                      <p className="text-xs font-semibold text-slate-600 mb-2">{label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-xs">Balance at start</label>
                          <input type="number" step="0.01" min="0" placeholder="0" value={a.opening}
                            onChange={(e) => set('opening', e.target.value)} /></div>
                        <div><label className="text-xs">Balance now</label>
                          <input type="number" step="0.01" min="0" placeholder="0" value={a.counted}
                            onChange={(e) => set('counted', e.target.value)} /></div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Expected {money(accExpected)}
                        {a.counted !== '' && <> &nbsp;<DifferenceBadge value={num(a.counted) - accExpected} money={money} /></>}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-3"><label>Notes</label>
              <input placeholder="e.g. Short because change was given from pocket…" value={count.notes}
                onChange={(e) => setCount({ ...count, notes: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Expected: {money(opening)} + {money(cash.in)} − {money(cash.out)} = <b>{money(expected)}</b>
              {counted !== null && <> &nbsp;<DifferenceBadge value={counted - expected} money={money} /></>}
            </p>
            <button className="btn btn-primary" disabled={saving || counted === null || otherTaken < 0}>
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

      {byPerson.length > 0 && (
        <div className="card mb-6">
          <p className="card-title">
            Short and over by person —{' '}
            {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Counted by</th>
                  <th className="text-right">Days</th>
                  <th className="text-right">Total short</th>
                  <th className="text-right">Total over</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.map((p) => (
                  <tr key={p.who}>
                    <td>{p.who}</td>
                    <td className="text-right">{p.days}</td>
                    <td className="text-right text-red-600">{p.short > 0.005 ? money(p.short) : '—'}</td>
                    <td className="text-right text-amber-700">{p.over > 0.005 ? money(p.over) : '—'}</td>
                    <td className="text-right"><DifferenceBadge value={p.over - p.short} money={money} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    <td className="text-right"><DifferenceBadge value={num(c.difference)} money={money} /></td>
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
