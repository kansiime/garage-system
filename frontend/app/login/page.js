'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await auth.login(username, password);
      localStorage.setItem('access_token', res.data.access);
      localStorage.setItem('refresh_token', res.data.refresh);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      router.push('/dashboard');
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-900">
      <form onSubmit={submit} className="bg-white p-8 rounded shadow w-96">
        <h1 className="text-2xl font-bold mb-4 text-center">🔧 Garage MS</h1>
        {error && <p className="text-red-500 mb-3">{error}</p>}
        <input className="mb-3" placeholder="Username"
          value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input className="mb-4" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary w-full" type="submit">Login</button>
      </form>
    </div>
  );
}