'use client';

/**
 * Shows where a customer stands against their credit limit. When over, an
 * admin/manager gets an "Allow over limit" checkbox; others are told to ask.
 */
export default function CreditLimitWarning({ position, money, canOverride, override, onOverride, verb = 'This sale leaves' }) {
  if (!position) return null;
  const p = position;
  if (!p.over) {
    return (
      <div className="mb-4 p-3 rounded-lg border text-sm bg-slate-50 border-slate-200 text-slate-700">
        <b>Credit limit:</b> {p.name} owes {money(p.owed)} of their {money(p.limit)} limit.
        {' '}After this: {money(p.owed + p.unpaid)} ({money(p.room - p.unpaid)} left).
      </div>
    );
  }
  return (
    <div className="mb-4 p-3 rounded-lg border text-sm bg-red-50 border-red-200 text-red-800">
      <b>⚠ Over credit limit.</b> {p.name} already owes {money(p.owed)} and their limit is {money(p.limit)},
      so they can take at most <b>{money(p.room)}</b> more on credit. {verb} {money(p.unpaid)} unpaid
      {p.room < p.unpaid && <> — that&apos;s <b>{money(p.unpaid - p.room)}</b> too much</>}.
      {canOverride ? (
        <label className="!flex items-center gap-2 mt-2 !text-sm !normal-case !tracking-normal !text-red-800 font-medium cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={override}
            onChange={(e) => onOverride(e.target.checked)} />
          Allow over limit (recorded in the notes)
        </label>
      ) : (
        <span> Ask a manager if this must go through.</span>
      )}
    </div>
  );
}
