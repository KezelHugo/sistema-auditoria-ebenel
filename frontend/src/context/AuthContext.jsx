import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getStoredToken, setStoredToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cerrarSesion = useCallback(() => {
    setStoredToken('');
    setUsuario(null);
  }, []);

  const verificarSesion = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUsuario(null);
      setCargando(false);
      return;
    }
    try {
      const data = await api.get('/api/auth/me', { skipUnauthorizedEvent: true });
      setUsuario(data.usuario);
    } catch (_) {
      setStoredToken('');
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    verificarSesion();
  }, [verificarSesion]);

  useEffect(() => {
    const onUnauthorized = () => cerrarSesion();
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
    setUsuario(data.usuario);
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
