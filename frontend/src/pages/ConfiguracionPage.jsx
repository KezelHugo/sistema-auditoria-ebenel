import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Truck, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { formatearFechaLima } from '../utils/formatters';

export default function ConfiguracionPage() {
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [resyncando, setResyncando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const logsRes = await api.get('/api/admin/sync-logs?limit=15');
      setLogs(logsRes.data || []);
    } catch (err) {
      setFeedback({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function forzarResyncBootstrap() {
    setResyncando(true);
    setFeedback(null);
    try {
      const res = await api.post('/api/admin/sync', { forzar_bootstrap: true });
      await cargarTodo();
      if (res.estado === 'EXITOSO') {
        setFeedback({
          tipo: 'ok',
          texto: `Resincronización completa finalizada: ${res.ocs_procesadas} OCs y ${res.ingresos_procesados} ingresos auditados.`
        });
      } else {
        setFeedback({ tipo: 'error', texto: `No se pudo sincronizar: ${res.error}` });
      }
    } catch (err) {
      setFeedback({ tipo: 'error', texto: err.message });
    } finally {
      setResyncando(false);
    }
  }

  return (
    <Layout onSyncComplete={cargarTodo}>
      {feedback && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-xs font-medium ${
            feedback.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.texto}
        </div>
      )}

      {cargando && logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Cargando configuración del sistema...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tarjeta de Plazos de Entrega por Laboratorio Proveedor */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Truck className="h-4 w-4 text-teal-700" />
                  Plazos de Entrega por Laboratorio Proveedor
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Los tiempos acordados de abastecimiento se configuran de forma independiente por cada proveedor en el catálogo de laboratorios (por defecto 3 días), modificables por el personal operativo. Si una orden de compra supera el plazo pactado, el sistema genera la alerta automática para el reclamo logístico.
                </p>
                <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/60 p-3 text-xs text-slate-700">
                  <span className="font-semibold text-teal-900">Alerta de reclamo automático: </span>
                  La auditoría evalúa en tiempo real cada recepción frente al plazo pactado de su laboratorio correspondiente.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={forzarResyncBootstrap}
                  disabled={resyncando}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  <RefreshCw className={`h-4 w-4 ${resyncando ? 'animate-spin' : ''}`} />
                  <span>{resyncando ? 'Reconstruyendo espejo...' : 'Re-sincronización completa (Bootstrap)'}</span>
                </button>

                <Link
                  to="/proveedores"
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 transition"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Gestionar Plazos de Laboratorios</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Historial de ejecuciones de sincronización */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Historial de Sincronizaciones Automáticas (Cron 5 min)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Ejecución</th>
                    <th className="px-4 py-2.5">Tipo</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5 text-right">OCs</th>
                    <th className="px-4 py-2.5 text-right">Ingresos</th>
                    <th className="px-4 py-2.5 text-right">Nuevas Alertas</th>
                    <th className="px-4 py-2.5 text-right">Latencia</th>
                    <th className="px-4 py-2.5">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500 tabular-nums">
                        {formatearFechaLima(log.ejecutado_en)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{log.tipo}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            log.estado === 'EXITOSO'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-rose-200 bg-rose-50 text-rose-700'
                          }`}
                        >
                          {log.estado}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{log.ocs_procesadas}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{log.ingresos_procesados}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{log.incidencias_detectadas}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{log.latencia_ms} ms</td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-slate-500">
                        {log.mensaje_error || `Modo ${log.modo_erp_detectado}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
