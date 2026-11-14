import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Lock, Mail, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mensajeExpiracion, setMensajeExpiracion] = useState('');

  useEffect(() => {
    const motivo = sessionStorage.getItem('ebenel_session_expired');
    if (motivo) {
      setMensajeExpiracion(motivo);
      sessionStorage.removeItem('ebenel_session_expired');
    }
  }, []);

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setCargando(false);
    }
  }

  function rellenarDemo(demoEmail) {
    setEmail(demoEmail);
    setPassword('Ebenel2026!');
    setError('');
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
            <Activity className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Droguería Ebenel S.A.C.</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sistema Externo de Auditoría y Trazabilidad Logística
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 text-xs text-slate-500">
            Ingresa con tu cuenta corporativa asignada por Gerencia.
          </p>

          <form onSubmit={manejarSubmit} className="mt-6 space-y-4">
            {mensajeExpiracion && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800 flex items-start gap-2 shadow-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>{mensajeExpiracion}</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-700">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="usuario@ebenel.com.pe"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              <span>{cargando ? 'Verificando credenciales...' : 'Ingresar a la plataforma'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200/80 pt-5">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Accesos de demostración (Entorno de pruebas)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => rellenarDemo('gerencia@ebenel.com.pe')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
              >
                <div className="text-xs font-semibold text-slate-800">Gerencia</div>
                <div className="truncate text-[11px] text-slate-500">Acceso total</div>
              </button>
              <button
                type="button"
                onClick={() => rellenarDemo('logistica@ebenel.com.pe')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
              >
                <div className="text-xs font-semibold text-slate-800">Empleado</div>
                <div className="truncate text-[11px] text-slate-500">Operación y alertas</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
