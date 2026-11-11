import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  Wallet,
  TrendingUp,
  ArrowUpRight,
  Clock,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from 'recharts';
import { api } from '../api/client';
import Layout from '../components/Layout';
import ModalDetalleOC from '../components/ModalDetalleOC';
import ModalGestionIncidencia from '../components/ModalGestionIncidencia';
import {
  formatearMoneda,
  formatearFechaCortaLima,
  TIPO_INCIDENCIA_META,
  ESTADO_GESTION_META
} from '../utils/formatters';

const COLORES_PARETO = {
  ENTREGA_INCOMPLETA: '#d97706',
  PRODUCTO_INMOVILIZADO_PRECIO: '#be123c',
  RETRASO_ENTREGA: '#0f766e'
};

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState('todo');
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ordenDetalleId, setOrdenDetalleId] = useState(null);
  const [incidenciaModal, setIncidenciaModal] = useState(null);

  const cargarDashboard = useCallback(async () => {
    setError('');
    try {
      const res = await api.get(`/api/dashboard?periodo=${periodo}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    cargarDashboard();
    // Actualización automática cada 5 minutos
    const id = setInterval(cargarDashboard, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [cargarDashboard]);

  const resAbast = data?.resumen_abastecimiento || {};
  const resInc = data?.resumen_incidencias || {};
  const rent = data?.rentabilidad || {};
  const pareto = data?.pareto || [];
  const topLabs = (data?.ranking_laboratorios || []).slice(0, 5);
  const recientes = data?.alertas_recientes || [];

  const activasTotal = (resInc.abiertas || 0) + (resInc.en_gestion || 0);

  return (
    <Layout statusExterno={data?.estado_erp || null} onSyncComplete={cargarDashboard}>
      {/* Filtros de periodo */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            Monitoreo desacoplado de Órdenes de Compra e Ingresos a Almacén (sincronización cada 5 min).
          </p>
        </div>

        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: 'todo', label: 'Histórico' },
            { id: 'mes_actual', label: 'Mes actual' },
            { id: '30d', label: '30 días' },
            { id: '7d', label: '7 días' }
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriodo(opt.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                periodo === opt.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {cargando && !data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Cargando indicadores logísticos...
        </div>
      ) : (
        <div className="space-y-6">
          {/* 4 KPI Cards Empresariales */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Fill Rate */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Fill Rate de Órdenes</span>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {Number(resAbast.fill_rate_ordenes_pct ?? 100).toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500 tabular-nums">
                  ({Number(resAbast.fill_rate_unidades_pct ?? 100).toFixed(1)}% unid.)
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                {resAbast.ocs_conformes || 0} conformes de {resAbast.ocs_recepcionadas || 0} recepcionadas • {resAbast.total_ocs || 0} OCs totales
              </p>
            </div>

            {/* Incidencias */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Incidencias por Atender</span>
                <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {activasTotal}
                </span>
                <span className="text-xs text-slate-500 tabular-nums">
                  activas ({resInc.resueltas || 0} resueltas)
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                {Number(resInc.tasa_ocs_con_incidencia_pct || 0).toFixed(1)}% de OCs con anomalías • {resAbast.ocs_vencidas_sin_entrega || 0} vencidas
              </p>
            </div>

            {/* Capital Inmovilizado */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Capital Inmovilizado</span>
                <div className="rounded-lg bg-rose-50 p-2 text-rose-700">
                  <Wallet className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatearMoneda(rent.capital_inmovilizado_pendiente_pen)}
                </span>
              </div>
              <p className="mt-2 text-xs text-emerald-700 font-medium tabular-nums">
                Liberado: {formatearMoneda(rent.capital_inmovilizado_liberado_pen)} ({Number(rent.tasa_liberacion_capital_pct || 0).toFixed(1)}%)
              </p>
            </div>

            {/* Lucro Cesante & Ahorro */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Lucro Cesante Recuperado</span>
                <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatearMoneda(rent.lucro_cesante_recuperado_pen)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                En riesgo: {formatearMoneda(rent.lucro_cesante_en_riesgo_pen)} • {rent.horas_hombre_ahorradas || 0}h ahorradas
              </p>
            </div>
          </div>

          {/* Gráficos principales */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Pareto */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Clasificación Pareto de Incidencias</h2>
                  <p className="text-xs text-slate-500">Frecuencia detectada vs. distribución histórica (48% / 40% / 12%)</p>
                </div>
                <Link
                  to="/incidencias"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  Ver alertas <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="h-64 w-full">
                {pareto.every(p => p.cantidad === 0) ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                    Sin incidencias en el periodo seleccionado
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={pareto.map(p => ({
                        ...p,
                        nombreCorto: TIPO_INCIDENCIA_META[p.tipo]?.corto || p.tipo
                      }))}
                      margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="nombreCorto" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px'
                        }}
                        formatter={(value, _name, props) => [
                          `${value} incidencia(s) (${props.payload.porcentaje}%)`,
                          'Detectadas'
                        ]}
                      />
                      <Bar dataKey="cantidad" radius={[6, 6, 0, 0]} maxBarSize={56}>
                        {pareto.map(entry => (
                          <Cell key={entry.tipo} fill={COLORES_PARETO[entry.tipo] || '#0f766e'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
                {pareto.map(item => (
                  <div key={item.tipo} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-medium text-slate-500">
                      {TIPO_INCIDENCIA_META[item.tipo]?.corto || item.tipo} (Ref. {item.referencia_tesis_pct}%)
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">{item.porcentaje}%</span>
                      <span className="text-[11px] text-slate-500 tabular-nums">{item.abiertas} activas</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranking de Laboratorios */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Desempeño por Laboratorio</h2>
                  <p className="text-xs text-slate-500">Proveedores con mayor impacto logístico y financiero</p>
                </div>
                <Link
                  to="/reportes"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  Analítica <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {topLabs.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                  Sin datos de proveedores aún
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {topLabs.map(lab => (
                    <div key={lab.laboratorio} className="flex items-center justify-between py-3 first:pt-1 last:pb-1">
                      <div className="min-w-0 pr-3">
                        <p className="truncate text-sm font-medium text-slate-900">{lab.laboratorio}</p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {lab.total_ocs} OCs • {lab.ocs_con_fallas} con observación
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold text-slate-900 tabular-nums">
                          {lab.incidencias} inc.
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {formatearMoneda(lab.capital_afectado)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between font-medium text-slate-800">
                  <span>Despachos protegidos vs. línea base</span>
                  <span className="text-teal-700 tabular-nums">
                    {rent.despachos_protegidos_vs_linea_base ?? 0} / 45 mensuales
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Mitigación sobre los {rent.despachos_mensuales_base || 400} despachos mensuales a clientes finales.
                </p>
              </div>
            </div>
          </div>

          {/* Tabla de Alertas Recientes */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Alertas Tempranas Recientes</h2>
                <p className="text-xs text-slate-500">Últimas anomalías detectadas por el algoritmo de conciliación</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cargarDashboard}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Actualizar
                </button>
                <Link
                  to="/incidencias"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Gestionar todas
                </Link>
              </div>
            </div>

            {recientes.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                No hay incidencias registradas todavía. El motor sincroniza cada 5 minutos con el ERP.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">OC / Fecha</th>
                      <th className="px-5 py-3">Tipo de Alerta</th>
                      <th className="px-5 py-3">Detalle / Producto</th>
                      <th className="px-5 py-3 text-right">Impacto</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {recientes.map(inc => {
                      const tMeta = TIPO_INCIDENCIA_META[inc.tipo_incidencia] || {};
                      const eMeta = ESTADO_GESTION_META[inc.estado_gestion] || {};
                      return (
                        <tr key={inc.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => setOrdenDetalleId(inc.orden_compra_id)}
                              className="font-semibold text-teal-700 hover:underline"
                            >
                              {inc.numero_oc}
                            </button>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400 tabular-nums">
                              <Clock className="h-3 w-3" />
                              {formatearFechaCortaLima(inc.detectada_en)}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tMeta.badge}`}>
                              {tMeta.corto || inc.tipo_incidencia}
                            </span>
                          </td>
                          <td className="max-w-xs px-5 py-3">
                            <div className="truncate font-medium text-slate-900">{inc.nombre_producto}</div>
                            <div className="truncate text-[11px] text-slate-500">{inc.laboratorio_nombre}</div>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-900 tabular-nums">
                            {formatearMoneda(inc.valor_economico_afectado)}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${eMeta.badge}`}>
                              {eMeta.etiqueta}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setIncidenciaModal(inc)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                            >
                              Gestionar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {ordenDetalleId && (
        <ModalDetalleOC
          ordenId={ordenDetalleId}
          onClose={() => setOrdenDetalleId(null)}
          onGestionarIncidencia={inc => {
            setOrdenDetalleId(null);
            setIncidenciaModal(inc);
          }}
        />
      )}

      {incidenciaModal && (
        <ModalGestionIncidencia
          incidencia={incidenciaModal}
          onClose={() => setIncidenciaModal(null)}
          onSaved={cargarDashboard}
        />
      )}
    </Layout>
  );
}
