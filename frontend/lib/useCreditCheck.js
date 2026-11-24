'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

/**
 * The existing customer a typed name/phone would be matched to, with what
 * they owe and their credit limit — looked up without creating anyone, so a
 * credit-limit warning can show before saving. Null when there's no match
 * or `enabled` is false.
 */
export function useCreditCheck(name, phone, enabled) {
  const [match, setMatch] = useState(null);
  useEffect(() => {
    const n = (name || '').trim();
    const p = (phone || '').trim();
    if (!enabled || (n.length < 2 && p.length < 9)) { setMatch(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      api.get(`/customers/credit-check/?name=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`)
        .then((res) => { if (!cancelled) setMatch(res.data.found ? res.data : null); })
        .catch(() => { if (!cancelled) setMatch(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [name, phone, enabled]);
  return match;
}

/** Credit-limit position if `unpaid` more is put on `customer`'s account. */
export function creditPosition(customer, unpaid) {
  if (!customer || customer.credit_limit === null || customer.credit_limit === undefined) return null;
  if (!(unpaid > 0)) return null;
  const owed = customer.balance || 0;
  const room = Math.max(0, customer.credit_limit - owed);
  return { name: customer.name, owed, limit: customer.credit_limit, room, unpaid, over: unpaid > room };
}
