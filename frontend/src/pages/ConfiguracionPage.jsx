import React, { useEffect, useState, useCallback } from 'react';
import { Save, Wifi, RefreshCw, Database } from 'lucide-react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { formatearFechaLima } from '../utils/formatters';

export default function ConfiguracionPage() {
  const [form, setForm] = useState(null);
  const [erpApiKeyNueva, setErpApiKeyNueva] = useState('');
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resyncando, setResyncando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const [cfgRes, logsRes] = await Promise.all([
        api.get('/api/admin/config'),
        api.get('/api/admin/sync-logs?limit=15')
      ]);
      setForm(cfgRes.config);
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

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setFeedback(null);
    try {
      const payload = {
        erp_base_url: form.erp_base_url,
        sync_interval_minutos: Number(form.sync_interval_minutos),
        tolerancia_dias_retraso: Number(form.tolerancia_dias_retraso),
        costo_hora_operativa: Number(form.costo_hora_operativa),
        horas_manuales_semana: Number(form.horas_manuales_semana),
        despachos_mensuales_base: Number(form.despachos_mensuales_base)
      };
      if (erpApiKeyNueva.trim()) {
        payload.erp_api_key = erpApiKeyNueva.trim();
      }
      const res = await api.put('/api/admin/config', payload);
      setForm(res.config);
      setErpApiKeyNueva('');
      setFeedback({ tipo: 'ok', texto: 'Configuración guardada y registrada en auditoría.' });
    } catch (err) {
      setFeedback({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(false);
    }
  }

  async function probarConexion() {
    setProbando(true);
    setFeedback(null);
    try {
      const res = await api.post('/api/admin/test-erp', {
        erp_base_url: form.erp_base_url,
        erp_api_key: erpApiKeyNueva.trim() || undefined
      });
      setFeedback({
        tipo: 'ok',
        texto: `Conexión exitosa (${res.latencia_ms}ms) • Modo ERP: ${res.modo_actual} • OCs disponibles: ${res.ocs_en_erp ?? 'N/D'}`
      });
    } catch (err) {
      setFeedback({ tipo: 'error', texto: `Sin conexión al ERP: ${err.message}` });
    } finally {
      setProbando(false);
    }
  }

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

      {cargando || !form ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Cargando configuración del sistema...
        </div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={guardar} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Integración ERP */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Database className="h-4 w-4 text-teal-700" />
                Conexión con API del ERP (Módulo 1)
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Conexión de solo lectura mediante API REST con sincronización automática cada 5 minutos.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">URL Base del ERP</label>
                  <input
                    type="url"
                    required
                    value={form.erp_base_url}
                    onChange={e => setForm({ ...form, erp_base_url: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Cabecera x-api-key {form.tiene_erp_api_key ? `(Actual: ${form.erp_api_key_masked})` : '(Sin clave configurada)'}
                  </label>
                  <input
                    type="password"
                    placeholder="Dejar en blanco para conservar la clave actual"
                    value={erpApiKeyNueva}
                    onChange={e => setErpApiKeyNueva(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Intervalo automático (min)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={form.sync_interval_minutos}
                      onChange={e => setForm({ ...form, sync_interval_minutos: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={probarConexion}
                      disabled={probando}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <Wifi className="h-4 w-4 text-teal-700" />
                      <span>{probando ? 'Probando...' : 'Probar Conexión'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Parámetros del Algoritmo de Auditoría */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6">
              <h2 className="text-sm font-semibold text-slate-900">Tolerancia de Retraso en Recepciones</h2>
              <p className="mt-1 text-xs text-slate-500">
                Días de gracia aplicados por el algoritmo de auditoría logística tras la fecha pactada de entrega de la Orden de Compra.
              </p>

              <div className="mt-5 max-w-sm">
                <label className="mb-1 block text-xs font-medium text-slate-700">Tolerancia retraso (días)</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={form.tolerancia_dias_retraso}
                  onChange={e => setForm({ ...form, tolerancia_dias_retraso: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">Días de gracia tras fecha pactada antes de generar alerta por demora</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-12">
              <button
                type="button"
                onClick={forzarResyncBootstrap}
                disabled={resyncando}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${resyncando ? 'animate-spin' : ''}`} />
                <span>{resyncando ? 'Reconstruyendo espejo...' : 'Re-sincronización completa (Bootstrap)'}</span>
              </button>

              <button
                type="submit"
                disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{guardando ? 'Guardando...' : 'Guardar configuración'}</span>
              </button>
            </div>
          </form>

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
