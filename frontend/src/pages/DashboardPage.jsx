import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  PackageX,
  ShieldAlert,
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

  const desgloseOcs = resInc.desglose_ocs_afectadas || {};
  const totalOcsConFallas = desgloseOcs.total_ocs_con_incidencias ?? ((resAbast.ocs_con_incidencias || 0) + (resAbast.ocs_vencidas_sin_entrega || 0));

  const catFaltantes = pareto.find(p => p.tipo === 'ENTREGA_INCOMPLETA') || {};
  const catRetencion = pareto.find(p => p.tipo === 'PRODUCTO_INMOVILIZADO_PRECIO') || {};
  const catRetraso = pareto.find(p => p.tipo === 'RETRASO_ENTREGA') || {};

  return (
    <Layout statusExterno={data?.estado_erp || null} onSyncComplete={cargarDashboard}>
      {/* Filtros de periodo */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            Control y conciliación de Órdenes de Compra frente a Ingresos a Almacén.
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
          {/* 4 Indicadores Logísticos y Operativos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Card 1: Órdenes con Incidencias */}
            <Link
              to="/incidencias"
              className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-rose-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 group-hover:text-slate-800 transition">
                  Órdenes con Incidencias
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="rounded-lg bg-rose-50 p-2 text-rose-700 group-hover:bg-rose-100 transition">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-rose-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {totalOcsConFallas}
                </span>
                <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 tabular-nums">
                  ({Number(resInc.tasa_ocs_con_incidencia_pct || 0).toFixed(1)}% del total)
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                {resAbast.ocs_conformes || 0} conformes sin observaciones • {resAbast.total_ocs || 0} OCs totales
              </p>
            </Link>

            {/* Card 2: Órdenes con Faltantes */}
            <Link
              to="/incidencias?tipo=ENTREGA_INCOMPLETA"
              className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 group-hover:text-slate-800 transition">
                  Órdenes con Faltantes
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-700 group-hover:bg-amber-100 transition">
                    <PackageX className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-amber-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {desgloseOcs.por_faltantes ?? (catFaltantes.cantidad > 0 ? 1 : 0)}
                </span>
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 tabular-nums">
                  {catFaltantes.cantidad || 0} anomalías
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                {catFaltantes.abiertas || 0} activas • {catFaltantes.resueltas || 0} resueltas
              </p>
            </Link>

            {/* Card 3: Órdenes con Retención */}
            <Link
              to="/incidencias?tipo=PRODUCTO_INMOVILIZADO_PRECIO"
              className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-rose-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 group-hover:text-slate-800 transition">
                  Órdenes con Retención
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="rounded-lg bg-rose-50 p-2 text-rose-700 group-hover:bg-rose-100 transition">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-rose-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {desgloseOcs.por_retencion_precio ?? (catRetencion.cantidad > 0 ? 1 : 0)}
                </span>
                <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 tabular-nums">
                  {catRetencion.cantidad || 0} anomalías
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                {catRetencion.abiertas || 0} activas • {catRetencion.resueltas || 0} resueltas
              </p>
            </Link>

            {/* Card 4: Órdenes con Retraso */}
            <Link
              to="/incidencias?tipo=RETRASO_ENTREGA"
              className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 group-hover:text-slate-800 transition">
                  Órdenes con Retraso
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="rounded-lg bg-orange-50 p-2 text-orange-700 group-hover:bg-orange-100 transition">
                    <Clock className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-orange-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {desgloseOcs.por_retraso ?? (catRetraso.cantidad > 0 ? 1 : 0)}
                </span>
                <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 tabular-nums">
                  {catRetraso.cantidad || 0} anomalías
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                {catRetraso.abiertas || 0} activas • {catRetraso.resueltas || 0} resueltas
              </p>
            </Link>
          </div>

          {/* Gráficos principales */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Gráfico de Incidencias por Causa */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Distribución de Incidencias por Causa Operativa</h2>
                  <p className="text-xs text-slate-500">Frecuencia y proporción de anomalías detectadas en recepción física</p>
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
                          `${value} anomalía(s) (${props.payload.porcentaje}%)`,
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
                      {TIPO_INCIDENCIA_META[item.tipo]?.etiqueta || item.tipo}
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">
                        {item.cantidad} ({item.porcentaje}%)
                      </span>
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
                  <span>Continuidad de Despachos a Clientes</span>
                  <span className="text-teal-700 font-semibold tabular-nums">
                    {rent.despachos_protegidos_vs_linea_base ?? 0} despachos protegidos
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Garantía de stock y disponibilidad inmediata para atención de pedidos a clientes sin quiebres de inventario.
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
