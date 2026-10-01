'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) router.push('/login');
  }, [router]);
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}