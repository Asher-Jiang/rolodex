async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  send: <T>(url: string, method: string, body?: unknown) => request<T>(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  upload: <T>(url: string, data: FormData) => request<T>(url, { method: 'POST', body: data }),
};
