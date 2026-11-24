'use client';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (s, opts) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, opts);

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'pick_month', label: 'Pick month' },
  { key: 'custom', label: 'Custom' },
];

export const DEFAULT_PERIOD = { key: 'today', month: '', start: '', end: '' };

/** The dates a picked period covers, and a short label for headings. */
export function periodRange(p) {
  const now = new Date();
  const today = iso(now);
  switch (p.key) {
    case 'week': {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { start: iso(s), end: today, label: 'last 7 days' };
    }
    case 'month':
      return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: today, label: 'this month' };
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: iso(s), end: iso(e), label: fmt(iso(s), { month: 'long', year: 'numeric' }) };
    }
    case 'year':
      return { start: iso(new Date(now.getFullYear(), 0, 1)), end: today, label: 'this year' };
    case 'pick_month': {
      if (!p.month) return null;
      const [y, m] = p.month.split('-').map(Number);
      const s = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const e = last > now ? now : last;
      return { start: iso(s), end: iso(e), label: fmt(iso(s), { month: 'long', year: 'numeric' }) };
    }
    case 'custom': {
      if (!p.start || !p.end) return null;
      const [s, e] = p.start <= p.end ? [p.start, p.end] : [p.end, p.start];
      const label = s === e ? fmt(s, { day: 'numeric', month: 'short', year: 'numeric' })
        : `${fmt(s, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      return { start: s, end: e, label };
    }
    default:
      return { start: today, end: today, label: 'today' };
  }
}

/** Query string for an API call covering the picked period. */
export function periodQuery(p) {
  const r = periodRange(p) || periodRange(DEFAULT_PERIOD);
  return new URLSearchParams({ period: 'custom', start: r.start, end: r.end }).toString();
}

/** Row of period buttons, with a month or date-range input when needed. */
export default function PeriodPicker({ value, onChange }) {
  const thisMonth = iso(new Date()).slice(0, 7);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 gap-1">
        {PERIODS.map((p) => (
          <button key={p.key} type="button"
            onClick={() => onChange({
              ...value, key: p.key,
              month: p.key === 'pick_month' && !value.month ? thisMonth : value.month,
            })}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${value.key === p.key
              ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {value.key === 'pick_month' && (
        <input type="month" value={value.month} max={thisMonth} aria-label="Month"
          onChange={(e) => onChange({ ...value, month: e.target.value })}
          className="!w-auto !py-1.5 text-sm" />
      )}
      {value.key === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={value.start} aria-label="From" className="!w-auto !py-1.5 text-sm"
            onChange={(e) => onChange({ ...value, start: e.target.value })} />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" value={value.end} aria-label="To" className="!w-auto !py-1.5 text-sm"
            onChange={(e) => onChange({ ...value, end: e.target.value })} />
        </div>
      )}
    </div>
  );
}
