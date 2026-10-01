'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [brand, setBrand] = useState('Garage MS');
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
    api.get('/auth/settings/')
      .then((r) => setBrand(r.data.name || 'Garage MS'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const baseLinks = [
    { href: '/dashboard',      label: 'Dashboard',      icon: '📊' },
    { href: '/inventory',      label: 'Inventory',      icon: '📦' },
    { href: '/sales',          label: 'Sales',          icon: '💰' },
    { href: '/purchases',      label: 'Purchases',      icon: '🛒' },
    { href: '/debts',          label: 'Debts',          icon: '🧾' },
    { href: '/expenses',       label: 'Expenses',       icon: '💸' },
    { href: '/returns',        label: 'Returns',        icon: '↩️' },
    { href: '/reconciliation', label: 'Recon',          icon: '⚖️' },
    { href: '/reports',        label: 'Reports',        icon: '📈' },
    { href: '/suppliers',      label: 'Suppliers',      icon: '🏢' },
  ];

  const links = user?.role === 'admin'
    ? [
        ...baseLinks,
        { href: '/users',    label: 'Users',    icon: '👥' },
        // { href: '/settings', label: 'Settings', icon: '⚙️' },
      ]
    : [
        ...baseLinks,
        { href: '/settings', label: 'Settings', icon: '⚙️' },
      ];

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand */}
          <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0 min-w-0">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0">
              🔧
            </div>
            <span className="text-base font-bold text-slate-900 truncate max-w-[160px] hidden sm:inline">
              {brand}
            </span>
          </Link>

          {/* Desktop links — visible from lg up */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1 justify-center flex-wrap">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="mr-1">{l.icon}</span>
                  {l.label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {user?.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="leading-tight hidden sm:block text-left">
                  <p className="text-xs font-semibold text-slate-900 max-w-[110px] truncate">
                    {user?.username || 'User'}
                  </p>
                  <p className="text-[10px] text-slate-500 capitalize">{user?.role}</p>
                </div>
                <span className="text-slate-500 text-xs">▾</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {user?.username}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    ⚙️ Settings
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 border-t border-slate-100"
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>

            {/* Hamburger — only on small screens (below lg) */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden btn btn-secondary btn-sm"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown — only below lg */}
        {menuOpen && (
          <div className="lg:hidden pb-3 space-y-1 border-t border-slate-100 pt-3">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="mr-2">{l.icon}</span>
                  {l.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}