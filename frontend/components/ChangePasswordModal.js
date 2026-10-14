'use client';
import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useToast } from '@/components/Toast';

const MIN_LENGTH = 6;

export default function ChangePasswordModal({ onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (form.next !== form.confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password/', {
        current_password: form.current,
        new_password: form.next,
      });
      toast.success('Password updated. Use your new password next time you log in.');
      onClose();
    } catch (err) {
      setError(apiError(err, 'Could not change password.'));
    } finally {
      setSaving(false);
    }
  };

  const type = show ? 'text' : 'password';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Change Password</h3>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
        )}
        <form onSubmit={submit}>
          <div className="mb-3"><label>Current password</label>
            <input type={type} autoComplete="current-password" value={form.current}
              onChange={set('current')} required autoFocus /></div>
          <div className="mb-3"><label>New password</label>
            <input type={type} autoComplete="new-password" value={form.next}
              onChange={set('next')} required minLength={MIN_LENGTH}
              placeholder={`At least ${MIN_LENGTH} characters`} /></div>
          <div className="mb-3"><label>Confirm new password</label>
            <input type={type} autoComplete="new-password" value={form.confirm}
              onChange={set('confirm')} required /></div>
          <label className="flex items-center gap-2 text-sm text-slate-600 normal-case tracking-normal font-normal mb-5">
            <input type="checkbox" className="w-auto" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show passwords
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
