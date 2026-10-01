'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';

const ROLES = ['admin', 'manager', 'cashier', 'storekeeper'];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({
    username: '', email: '', first_name: '', last_name: '',
    phone: '', role: 'cashier', password: '',
  });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('users');   // 'users' | 'audit'

  const load = async () => {
    const [u] = await Promise.all([api.get('/auth/users/')]);
    setUsers(u.data);
  };

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setMe(JSON.parse(stored));
    load();
  }, []);

  if (me && me.role !== 'admin') {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Access denied</p>
          <p className="text-sm text-slate-500 mt-1">Only administrators can manage users.</p>
        </div>
      </ProtectedRoute>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.put(`/auth/users/${editing}/`, payload);
      } else {
        await api.post('/auth/users/', form);
      }
      setForm({ username: '', email: '', first_name: '', last_name: '', phone: '', role: 'cashier', password: '' });
      setEditing(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Could not save user.');
    }
  };

  const edit = (u) => {
    setEditing(u.id);
    setForm({
      username: u.username, email: u.email || '',
      first_name: u.first_name || '', last_name: u.last_name || '',
      phone: u.phone || '', role: u.role, password: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleActive = async (u) => {
    await api.post(`/auth/users/${u.id}/toggle_active/`);
    load();
  };

  const del = async (u) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/auth/users/${u.id}/`);
      load();
    } catch {
      alert('Could not delete. Users with history may need to be deactivated instead.');
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">Create, edit, deactivate, and audit users</p>
        </div>
      </div>

      <div className="mb-4 border-b border-slate-200">
        <div className="flex gap-1">
          <TabBtn active={tab === 'users'} onClick={() => setTab('users')}>👥 Users</TabBtn>
          <TabBtn active={tab === 'audit'} onClick={() => setTab('audit')}>📜 Audit Log</TabBtn>
        </div>
      </div>

      {tab === 'users' && (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <form onSubmit={submit} className="card mb-6">
            <p className="card-title">{editing ? 'Edit User' : 'Create User'}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
              <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label>First Name</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><label>Last Name</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
              <div>
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="md:col-span-3">
                <label>{editing ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                <input type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editing} minLength={6} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {editing && (
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setEditing(null);
                  setForm({ username: '', email: '', first_name: '', last_name: '', phone: '', role: 'cashier', password: '' });
                }}>Cancel</button>
              )}
              <button className="btn btn-primary">{editing ? 'Update' : 'Create'} User</button>
            </div>
          </form>

          <div className="table-wrap overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Username</th><th>Name</th><th>Email</th><th>Role</th>
                  <th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.username}</td>
                    <td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td>{u.email || '—'}</td>
                    <td><span className="badge badge-blue">{u.role}</span></td>
                    <td>
                      <span className={u.is_active ? 'badge badge-green' : 'badge badge-red'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-secondary btn-sm mr-1" onClick={() => edit(u)}>Edit</button>
                      <button className="btn btn-secondary btn-sm mr-1" onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(u)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'audit' && <AuditLog />}
    </ProtectedRoute>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filterUser) q.set('user', filterUser);
    if (filterAction) q.set('action', filterAction);
    const res = await api.get(`/auth/audit/?${q.toString()}`);
    setLogs(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterUser, filterAction]);

  const actionBadge = (a) => {
    if (a.startsWith('stock')) return 'badge badge-blue';
    if (a === 'delete') return 'badge badge-red';
    if (a === 'create') return 'badge badge-green';
    if (a === 'login') return 'badge badge-gray';
    if (a === 'payment') return 'badge badge-amber';
    return 'badge badge-gray';
  };

  return (
    <div className="card">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label>Filter by action</label>
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
            <option value="">All actions</option>
            <option value="login">Login</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="stock_in">Stock In</option>
            <option value="stock_out">Stock Out</option>
            <option value="stock_adjust">Stock Adjustment</option>
            <option value="reconcile">Reconciliation</option>
            <option value="payment">Payment</option>
          </select>
        </div>
      </div>

      <div className="table-wrap overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>When</th><th>User</th><th>Role</th>
              <th>Action</th><th>Object</th><th>Description</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-slate-400 py-6">Loading…</td></tr>}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 py-6">No activity yet.</td></tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {new Date(l.created_at).toLocaleString()}
                </td>
                <td className="font-medium">{l.username || '—'}</td>
                <td className="text-xs text-slate-500 capitalize">{l.role || '—'}</td>
                <td><span className={actionBadge(l.action)}>{l.action.replace('_', ' ')}</span></td>
                <td className="text-xs font-mono">{l.model_name}{l.object_id ? `#${l.object_id}` : ''}</td>
                <td className="text-sm">{l.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}