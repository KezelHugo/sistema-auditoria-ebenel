import React, { useEffect, useState, useCallback } from 'react';
import { History, Activity } from 'lucide-react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import Paginacion from '../components/Paginacion';
import { formatearFechaLima } from '../utils/formatters';

function formatearTipoSync(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t.includes('AUTO') || t === 'CRON') {
    return { label: 'Automática', esManual: false };
  }
  return { label: 'Manual', esManual: true };
}

export default function ConfiguracionPage() {
  const [logs, setLogs] = useState([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const ITEMS_POR_PAGINA = 200;

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const offset = (pagina - 1) * ITEMS_POR_PAGINA;
      const logsRes = await api.get(`/api/admin/sync-logs?limit=${ITEMS_POR_PAGINA}&offset=${offset}`);
      setLogs(logsRes.data || []);
      setTotalRegistros(logsRes.total || 0);
    } catch (err) {
      setFeedback({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, [pagina]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

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

      {/* Encabezado descriptivo de la vista */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Historial de Sincronizaciones con el ERP</h1>
          <p className="mt-1 text-xs text-slate-500">
            Registro cronológico y trazabilidad de cada extracción de datos y auditoría de órdenes de compra e ingresos de almacén.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            Total registrado: <strong className="text-slate-900 tabular-nums">{totalRegistros}</strong> sincronizaciones
          </span>
        </div>
      </div>

      {/* Tabla del Historial de Sincronizaciones */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {cargando && logs.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Cargando historial de sincronizaciones...
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Ejecución</th>
                    <th className="px-5 py-3.5 text-center">Tipo</th>
                    <th className="px-5 py-3.5 text-center">Estado</th>
                    <th className="px-5 py-3.5 text-right">OCs Procesadas</th>
                    <th className="px-5 py-3.5 text-right">Ingresos Procesados</th>
                    <th className="px-5 py-3.5 text-right">Alertas Detectadas</th>
                    <th className="px-5 py-3.5 text-right">Latencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                        No se registran sincronizaciones en el sistema.
                      </td>
                    </tr>
                  ) : (
                    logs.map(log => {
                      const { label, esManual } = formatearTipoSync(log.tipo);
                      const esExitoso = log.estado === 'EXITOSO';

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition">
                          <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-700 tabular-nums">
                            {formatearFechaLima(log.ejecutado_en)}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                esManual
                                  ? 'border-teal-200 bg-teal-50 text-teal-800'
                                  : 'border-slate-200 bg-slate-100 text-slate-700'
                              }`}
                            >
                              {label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                esExitoso
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-rose-200 bg-rose-50 text-rose-700'
                              }`}
                            >
                              {log.estado}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right text-slate-700 tabular-nums">
                            {log.ocs_procesadas}
                          </td>
                          <td className="px-5 py-3.5 text-right text-slate-700 tabular-nums">
                            {log.ingresos_procesados}
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums">
                            {Number(log.incidencias_detectadas || 0) > 0 ? (
                              <span className="text-amber-700">{log.incidencias_detectadas}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right text-slate-500 tabular-nums">
                            {log.latencia_ms} ms
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Paginacion
              paginaActual={pagina}
              totalRegistros={totalRegistros}
              porPagina={ITEMS_POR_PAGINA}
              alCambiarPagina={setPagina}
              nombreEntidad="sincronizaciones"
            />
          </>
        )}
      </div>
    </Layout>
  );
}
