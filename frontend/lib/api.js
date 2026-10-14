import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (u, p) => api.post('/auth/login/', { username: u, password: p }),
  me: () => api.get('/auth/users/me/'),
};

export const downloadFile = async (url, filename) => {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
};

// Turn a DRF error response into one readable line.
export const apiError = (err, fallback = 'Something went wrong.') => {
  const d = err?.response?.data;
  if (!d || typeof d !== 'object') return fallback;
  if (d.detail) return String(d.detail);
  const flat = (v) => (Array.isArray(v) ? v.map(flat).join(' ') : typeof v === 'object' && v ? Object.values(v).map(flat).join(' ') : String(v));
  return Object.values(d).map(flat).filter(Boolean).join(' ') || fallback;
};

export default api;