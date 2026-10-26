'use client';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

/**
 * Customer name box that suggests existing customers as you type.
 * Picking one calls onPick(customer); typing a new name calls onType(text)
 * (the sale then creates or matches the customer by name/phone).
 */
export default function CustomerNameInput({ value, picked, onType, onPick, onClear, ...inputProps }) {
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const q = (value || '').trim();
    if (picked || q.length < 2) { setMatches([]); return; }
    const t = setTimeout(() => {
      api.get(`/customers/?search=${encodeURIComponent(q)}`)
        .then((res) => setMatches(res.data.customers.slice(0, 8)))
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value, picked]);

  useEffect(() => {
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <input {...inputProps} value={value} autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onType(e.target.value); setOpen(true); }} />
      {picked && (
        <button type="button" onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-green-700 hover:text-red-600"
          title="Not this customer">
          ✓ existing ✕
        </button>
      )}
      {open && !picked && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {matches.map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => { onPick(c); setOpen(false); }}>
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="text-slate-500"> · {c.phone}</span>}
                {c.balance > 0 && <span className="text-red-600 text-xs"> · owes {c.balance.toLocaleString()}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
