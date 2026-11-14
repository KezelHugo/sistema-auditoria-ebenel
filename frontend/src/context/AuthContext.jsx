import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  api,
  getStoredToken,
  setStoredToken,
  getStoredUser,
  setStoredUser,
  isTokenExpired,
  manejarSesionExpirada
} from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => getStoredUser());
  const [cargando, setCargando] = useState(true);

  const cerrarSesion = useCallback((motivo = null) => {
    manejarSesionExpirada(motivo || 'Sesión finalizada.');
    setUsuario(null);
  }, []);

  const verificarSesion = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUsuario(null);
      setStoredUser(null);
      setCargando(false);
      return;
    }

    // Comprobación proactiva: si el token ya venció según el reloj local, redirigir al login
    if (isTokenExpired(token)) {
      cerrarSesion('Tu sesión ha expirado por inactividad. Por favor, inicia sesión nuevamente.');
      setCargando(false);
      return;
    }

    try {
      const data = await api.get('/api/auth/me', { skipUnauthorizedEvent: true });
      setUsuario(data.usuario);
      setStoredUser(data.usuario);
    } catch (err) {
      // Si el servidor explícitamente respondió 401 o 403, el token es inválido o el usuario fue desactivado
      if (err.status === 401 || err.status === 403) {
        cerrarSesion(err.message || 'Tu sesión ha expirado o el acceso fue revocado.');
      } else {
        // En caso de micro-corte de red o servidor reconectando, si el token aún no ha expirado localmente,
        // mantenemos la sesión abierta con el usuario en caché para no forzar un login injustificado
        const cacheado = getStoredUser();
        if (cacheado) {
          setUsuario(cacheado);
        } else {
          setUsuario(null);
        }
      }
    } finally {
      setCargando(false);
    }
  }, [cerrarSesion]);

  useEffect(() => {
    verificarSesion();
  }, [verificarSesion]);

  // Detector periódico de expiración del token cada 15 segundos
  useEffect(() => {
    function chequearExpiracion() {
      const token = getStoredToken();
      if (!token) return;
      if (isTokenExpired(token)) {
        cerrarSesion('Tu sesión ha expirado por inactividad. Por favor, inicia sesión nuevamente.');
      }
    }

    const timer = setInterval(chequearExpiracion, 15000);
    return () => clearInterval(timer);
  }, [cerrarSesion]);

  // Listener para eventos de desautorización automáticos (401 o revocación)
  useEffect(() => {
    const onUnauthorized = (e) => {
      const motivo = e?.detail?.motivo || 'Tu sesión ha expirado o el acceso ha sido revocado. Inicia sesión nuevamente.';
      cerrarSesion(motivo);
    };
    window.addEventListener('ebenel:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ebenel:unauthorized', onUnauthorized);
  }, [cerrarSesion]);

  async function login(email, password) {
    const data = await api.post(
      '/api/auth/login',
      { email, password },
      { skipUnauthorizedEvent: true }
    );
    setStoredToken(data.token);
    setStoredUser(data.usuario);
    setUsuario(data.usuario);
    sessionStorage.removeItem('ebenel_session_expired');
    return data.usuario;
  }

  const value = {
    usuario,
    cargando,
    esGerencia: usuario?.rol === 'GERENCIA',
    login,
    cerrarSesion,
    recargarUsuario: verificarSesion
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
