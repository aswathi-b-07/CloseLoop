// Configurable base URL. Backend sends permissive CORS headers, so we can call
// it directly from the browser. Defaults to http://localhost:8000.
export const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (e) {
    // Network-level failure (backend down, CORS, DNS, etc.)
    throw new ApiError(
      `Cannot reach the backend at ${API}. Is it running?`,
      0,
      e,
    )
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.detail || body?.error || JSON.stringify(body)
    } catch {
      detail = res.statusText
    }
    throw new ApiError(`Request failed (${res.status}): ${detail}`, res.status)
  }
  return res.json()
}

export class ApiError extends Error {
  constructor(message, status = 0, cause) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.cause = cause
  }
}

export const api = {
  health: () => request('/health'),
  reconcile: (body) =>
    request('/reconcile', { method: 'POST', body: JSON.stringify(body) }),
  metrics: () => request('/metrics'),
  exceptions: () => request('/exceptions'),
  entity: (id) => request(`/entity/${encodeURIComponent(id)}`),
  auditRuns: () => request('/audit/runs'),
  auditDecisions: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== ''),
    ).toString()
    return request(`/audit/decisions${qs ? `?${qs}` : ''}`)
  },
  ask: (question) =>
    request('/ask', { method: 'POST', body: JSON.stringify({ question }) }),
}
