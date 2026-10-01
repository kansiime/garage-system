'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    router.push(token ? '/dashboard' : '/login');
  }, [router]);
  return <div className="p-8">Redirecting...</div>;
}