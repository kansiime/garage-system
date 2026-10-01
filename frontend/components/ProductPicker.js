'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Searchable product picker.
 *
 * Props:
 *  - products:   array of product objects
 *  - value:      currently selected product id (or '')
 *  - onChange:   (productId, productObject) => void
 *  - placeholder: string
 *  - showStock:  whether to show stock hint (default true)
 *  - showPrice:  whether to show price hint (default true)
 *  - currency:   string, e.g. 'UGX'
 */
export default function ProductPicker({
  products = [],
  value = '',
  onChange,
  placeholder = 'Search product by name or SKU…',
  showStock = true,
  showPrice = true,
  currency = 'UGX',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // The currently-selected product object
  const selected = useMemo(
    () => products.find((p) => String(p.id) === String(value)),
    [products, value]
  );

  // Keep the input text in sync when a value is set externally
  useEffect(() => {
    if (selected) {
      setQuery(selected.name);
    } else {
      setQuery('');
    }
  }, [selected]);

  // Filter products by query (name or SKU), case-insensitive
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50); // limit for perf
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [products, query]);

  // Reset highlight when results change
  useEffect(() => { setHighlight(0); }, [query]);

  // Close on outside click
  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        // Restore query to selected item's name
        if (selected) setQuery(selected.name);
        else setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [selected]);

  const choose = (product) => {
    onChange?.(product.id, product);
    setQuery(product.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    onChange?.('', null);
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      scrollHighlightIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      scrollHighlightIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      if (selected) setQuery(selected.name);
      else setQuery('');
    }
  };

  const scrollHighlightIntoView = () => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-highlighted="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm px-2 py-1"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400 text-center">
              No products match “{query}”
            </div>
          ) : (
            filtered.map((p, i) => {
              const isHighlighted = i === highlight;
              const isSelected = String(p.id) === String(value);
              return (
                <button
                  key={p.id}
                  type="button"
                  data-highlighted={isHighlighted}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(p)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 border-b border-slate-100 last:border-b-0 transition-colors ${
                    isHighlighted
                      ? 'bg-blue-50'
                      : isSelected
                        ? 'bg-blue-25'
                        : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {p.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {p.sku}
                      {p.category_name ? ` • ${p.category_name}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {showPrice && (
                      <p className="text-xs font-semibold text-slate-900">
                        {currency} {Number(p.selling_price).toLocaleString()}
                      </p>
                    )}
                    {showStock && (
                      <p
                        className={`text-[11px] ${
                          p.quantity <= (p.reorder_level || 0)
                            ? 'text-red-600 font-semibold'
                            : 'text-slate-500'
                        }`}
                      >
                        Stock: {p.quantity}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}