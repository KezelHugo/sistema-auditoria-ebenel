const API_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const TOKEN_KEY = 'ebenel_auditoria_token';
const USER_KEY = 'ebenel_auditoria_usuario';

export function parseJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (_) {
    return null;
  }
}

export function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return true;
  // Margen de 10 segundos antes de la expiración real
  return (payload.exp * 1000) <= (Date.now() + 10000);
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function manejarSesionExpirada(motivo = 'Tu sesión ha expirado por inactividad. Por favor, inicia sesión nuevamente.') {
  setStoredToken('');
  setStoredUser(null);
  sessionStorage.setItem('ebenel_session_expired', motivo);
  window.dispatchEvent(new CustomEvent('ebenel:unauthorized', { detail: { reason: 'session_expired', motivo } }));
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login');
  }
}

async function request(path, { method = 'GET', body = null, headers = {}, skipUnauthorizedEvent = false } = {}) {
  const token = getStoredToken();

  // Validación proactiva: si el token ya expiró según el reloj local, redirigir al login de inmediato
  if (token && isTokenExpired(token) && !skipUnauthorizedEvent) {
    manejarSesionExpirada('Tu sesión ha expirado por inactividad. Por favor, inicia sesión nuevamente.');
    const err = new Error('Sesión expirada.');
    err.status = 401;
    throw err;
  }

  const reqHeaders = {
    Accept: 'application/json',
    ...headers
  };

  if (body !== null && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: reqHeaders,
      body: body !== null ? JSON.stringify(body) : undefined
    });
  } catch (netErr) {
    if (token && isTokenExpired(token) && !skipUnauthorizedEvent) {
      manejarSesionExpirada('Tu sesión ha expirado por inactividad. Por favor, inicia sesión nuevamente.');
    }
    const err = new Error('No se pudo conectar con el servidor corporativo. Verifica tu conexión de red o intenta nuevamente.');
    err.originalError = netErr;
    err.isNetworkError = true;
    throw err;
  }

  if (res.status === 401 && !skipUnauthorizedEvent) {
    manejarSesionExpirada('Tu sesión ha expirado o el token es inválido. Por favor, inicia sesión nuevamente.');
  }

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof payload === 'object' && payload?.error ? payload.error : `Error HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = payload;
    throw err;
  }

  return payload;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),

  async downloadCsv(path, filename) {
    const token = getStoredToken();
    if (token && isTokenExpired(token)) {
      manejarSesionExpirada('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
      throw new Error('Sesión expirada.');
    }

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
    } catch (netErr) {
      throw new Error('No se pudo conectar con el servidor para descargar el reporte CSV.');
    }

    if (res.status === 401) {
      manejarSesionExpirada('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
      throw new Error('Sesión expirada.');
    }
    if (!res.ok) {
      throw new Error('No se pudo descargar el reporte CSV.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
};
