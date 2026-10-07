const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function fetchApi(pathname: string, options?: RequestInit): Promise<Response> {
  if (!apiBase && import.meta.env.BASE_URL !== '/') {
    return Promise.reject(new Error('Backend Gemini untuk GitHub Pages belum dihubungkan. Pemilik aplikasi perlu mengatur VITE_API_BASE_URL lalu deploy ulang.'));
  }
  return fetch(apiBase + pathname, options);
}
