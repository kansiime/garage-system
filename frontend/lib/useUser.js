'use client';
import { useEffect, useState } from 'react';

export function useUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (raw) setUser(JSON.parse(raw));
  }, []);

  return user;
}

export function hasRole(user, ...roles) {
  return user && roles.includes(user.role);
}

export const can = {
  manageUsers: (u) => hasRole(u, 'admin'),
  editDebts: (u) => hasRole(u, 'admin', 'manager'),
  createDebts: (u) => hasRole(u, 'admin', 'manager'),
  viewExpenses: (u) => hasRole(u, 'admin', 'manager'),
  viewSuppliers: (u) => hasRole(u, 'admin', 'manager', 'storekeeper'),
  viewInventoryCost: (u) => hasRole(u, 'admin', 'manager', 'storekeeper'),
  reconcile: (u) => hasRole(u, 'admin'),
  createReturns: (u) => hasRole(u, 'admin', 'manager', 'storekeeper'),
  recordPayment: (u) => hasRole(u, 'admin', 'manager', 'cashier'),
};