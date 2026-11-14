import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Menu, Clock, Database } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatearFechaLima, formatearTiempoRelativo } from '../utils/formatters';

export default function ApiStatusHeader({ titulo, onOpenMobileMenu, onSyncComplete, statusExterno = null }) {
  const { esGerencia } = useAuth();
  const [status, setStatus] = useState(statusExterno);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeToast, setMensajeToast] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    if (statusExterno) {
      setStatus(statusExterno);
    }
  }, [statusExterno]);

  const consultarEstado = useCallback(async (forzarCheck = true) => {
    try {
      const data = await api.get(`/api/status${forzarCheck ? '?check=1' : ''}`);
      setStatus(data);
    } catch (_) {
      // Mantiene el último estado conocido si falla temporalmente
    }
  }, []);

  useEffect(() => {
    consultarEstado(true);
    const idPoll = setInterval(() => consultarEstado(true), 60000);
    const idTick = setInterval(() => setTick(t => t + 1), 30000);
    return () => {
      clearInterval(idPoll);
      clearInterval(idTick);
    };
  }, [consultarEstado]);

  async function manejarSyncManual() {
    if (!esGerencia || sincronizando) return;
    setSincronizando(true);
    setMensajeToast('');
    try {
      const res = await api.post('/api/admin/sync', {});
      await consultarEstado(false);
      if (res.estado === 'EXITOSO') {
        setMensajeToast(`Sincronizado: ${res.ocs_procesadas} OCs, ${res.incidencias_detectadas} nuevas incidencias.`);
        onSyncComplete?.();
      } else {
        setMensajeToast(`ERP Offline: ${res.error || 'Sin respuesta del ERP'}`);
      }
    } catch (err) {
      setMensajeToast(err.message);
      await consultarEstado(false);
    } finally {
      setSincronizando(false);
      setTimeout(() => setMensajeToast(''), 5000);
    }
  }

  const conectado = Boolean(status?.erp_conectado);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{titulo}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {mensajeToast && (
            <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 md:inline-block">
              {mensajeToast}
            </span>
          )}

          {/* Indicador obligatorio de conexión con API del ERP */}
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              conectado
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
            title={status?.erp_base_url ? `Endpoint ERP: ${status.erp_base_url}` : 'Estado de API del ERP'}
          >
            <span className="relative flex h-2 w-2">
              {conectado && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${conectado ? 'bg-emerald-600' : 'bg-rose-600'}`} />
            </span>
            <Database className="h-3.5 w-3.5 opacity-75" />
            <span>API ERP: {conectado ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          {/* Indicador de última actualización (cada 5 min automático) */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden sm:inline text-slate-500">Última act.:</span>
            <span className="font-medium text-slate-800 tabular-nums">
              {formatearTiempoRelativo(status?.ultima_actualizacion_at)}
            </span>
            {status?.ultima_actualizacion_at && (
              <span className="hidden text-slate-400 xl:inline tabular-nums">
                ({formatearFechaLima(status.ultima_actualizacion_at)})
              </span>
            )}
          </div>

          {esGerencia && (
            <button
              type="button"
              onClick={manejarSyncManual}
              disabled={sincronizando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
