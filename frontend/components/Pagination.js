'use client';

export default function Pagination({
  page, totalPages, goTo, startIndex, endIndex, totalItems, label = 'items',
}) {
  if (totalItems === 0) return null;

  const buttons = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, page + 2);

  if (from > 1) {
    buttons.push(
      <button key={1} className="btn btn-secondary btn-sm" onClick={() => goTo(1)}>1</button>
    );
    if (from > 2) buttons.push(<span key="lead" className="px-2 text-slate-400">…</span>);
  }

  for (let i = from; i <= to; i++) {
    buttons.push(
      <button
        key={i}
        className={i === page ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
        onClick={() => goTo(i)}
      >
        {i}
      </button>
    );
  }

  if (to < totalPages) {
    if (to < totalPages - 1) buttons.push(<span key="trail" className="px-2 text-slate-400">…</span>);
    buttons.push(
      <button key={totalPages} className="btn btn-secondary btn-sm" onClick={() => goTo(totalPages)}>
        {totalPages}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-8">
      <p className="text-sm text-slate-600">
        Showing <b>{startIndex + 1}</b>–<b>{Math.min(endIndex, totalItems)}</b> of{' '}
        <b>{totalItems}</b> {label}
      </p>
      <div className="flex items-center gap-1 flex-wrap">
        <button className="btn btn-secondary btn-sm" onClick={() => goTo(1)} disabled={page === 1}>«</button>
        <button className="btn btn-secondary btn-sm" onClick={() => goTo(page - 1)} disabled={page === 1}>
          ← Previous
        </button>
        {buttons}
        <button className="btn btn-secondary btn-sm" onClick={() => goTo(page + 1)} disabled={page === totalPages}>
          Next →
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
      </div>
    </div>
  );
}