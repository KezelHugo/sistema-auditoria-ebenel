import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  PackageX,
  ShieldAlert,
  ArrowUpRight,
  Clock,
  RefreshCw,
  ChevronLeft,
  ChevronRight
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
  obtenerEstadoCompromiso,
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
  const [paginaAlertas, setPaginaAlertas] = useState(1);
  const ALERTAS_POR_PAGINA = 10;

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

  useEffect(() => {
    setPaginaAlertas(1);
  }, [periodo]);

  const resAbast = data?.resumen_abastecimiento || {};
  const resInc = data?.resumen_incidencias || {};
  const rent = data?.rentabilidad || {};
  const pareto = data?.pareto || [];
  const topLabs = (data?.ranking_laboratorios || []).slice(0, 5);

  const desgloseOcs = resInc.desglose_ocs_afectadas || {};
  const totalOcsConFallas = desgloseOcs.total_ocs_con_incidencias ?? ((resAbast.ocs_con_incidencias || 0) + (resAbast.ocs_vencidas_sin_entrega || 0));
  const activasTotal = (resInc.abiertas || 0) + (resInc.en_gestion || 0);

  const catFaltantes = pareto.find(p => p.tipo === 'ENTREGA_INCOMPLETA') || {};
  const catRetencion = pareto.find(p => p.tipo === 'PRODUCTO_INMOVILIZADO_PRECIO') || {};
  const catRetraso = pareto.find(p => p.tipo === 'RETRASO_ENTREGA') || {};

  // Distribución de causas calculada estrictamente sobre incidencias activas
  const totalActivasPareto = pareto.reduce((acc, it) => acc + Number(it.abiertas || 0), 0);
  const paretoActivas = pareto.map(it => {
    const act = Number(it.abiertas || 0);
    const pct = totalActivasPareto > 0 ? Number(((act / totalActivasPareto) * 100).toFixed(1)) : 0;
    return {
      ...it,
      activas: act,
      porcentajeActivas: pct,
      nombreCorto: TIPO_INCIDENCIA_META[it.tipo]?.corto || it.tipo,
      etiqueta: TIPO_INCIDENCIA_META[it.tipo]?.etiqueta || it.tipo
    };
  });

  // Cálculo de porcentaje de confianza por laboratorio
  const labsConConfianza = topLabs.map(lab => {
    const ocsConformes = Number(lab.ocs_conformes ?? Math.max(0, lab.total_ocs - lab.ocs_con_fallas));
    const pctConfianza = Number(lab.porcentaje_confianza ?? (lab.total_ocs > 0 ? ((ocsConformes / lab.total_ocs) * 100).toFixed(0) : 100));
    return {
      ...lab,
      ocs_conformes: ocsConformes,
      pct_confianza: pctConfianza
    };
  });

  const promedioConfianzaGlobal = labsConConfianza.length > 0
    ? (labsConConfianza.reduce((acc, l) => acc + l.pct_confianza, 0) / labsConConfianza.length).toFixed(1)
    : '100.0';

  // Solo incidencias no resueltas (activas) con paginación de 10
  const alertasActivas = (data?.alertas_recientes || []).filter(
    i => i.estado_gestion === 'ABIERTA' || i.estado_gestion === 'EN_GESTION'
  );
  const totalAlertas = alertasActivas.length;
  const totalPaginasAlertas = Math.max(1, Math.ceil(totalAlertas / ALERTAS_POR_PAGINA));
  const alertasPaginadas = alertasActivas.slice(
    (paginaAlertas - 1) * ALERTAS_POR_PAGINA,
    paginaAlertas * ALERTAS_POR_PAGINA
  );

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
                  <div className={`rounded-lg p-2 transition ${activasTotal > 0 ? 'bg-rose-50 text-rose-700 group-hover:bg-rose-100' : 'bg-slate-100 text-slate-600'}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-rose-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {activasTotal}
                </span>
                <span className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums ${activasTotal > 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {activasTotal === 1 ? '1 activa' : `${activasTotal} activas`}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                Total: {resInc.total_incidencias || 0} ({totalOcsConFallas} OCs) • <span className="font-medium text-emerald-700">{resInc.resueltas || 0} resueltas</span>
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
                  <div className={`rounded-lg p-2 transition ${(catFaltantes.abiertas || 0) > 0 ? 'bg-amber-50 text-amber-700 group-hover:bg-amber-100' : 'bg-slate-100 text-slate-600'}`}>
                    <PackageX className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-amber-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {catFaltantes.abiertas || 0}
                </span>
                <span className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums ${(catFaltantes.abiertas || 0) > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {(catFaltantes.abiertas || 0) === 1 ? '1 activa' : `${catFaltantes.abiertas || 0} activas`}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                Total: {catFaltantes.cantidad || 0} ({desgloseOcs.por_faltantes ?? 0} OCs) • <span className="font-medium text-emerald-700">{catFaltantes.resueltas || 0} resueltas</span>
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
                  <div className={`rounded-lg p-2 transition ${(catRetencion.abiertas || 0) > 0 ? 'bg-rose-50 text-rose-700 group-hover:bg-rose-100' : 'bg-slate-100 text-slate-600'}`}>
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-rose-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {catRetencion.abiertas || 0}
                </span>
                <span className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums ${(catRetencion.abiertas || 0) > 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {(catRetencion.abiertas || 0) === 1 ? '1 activa' : `${catRetencion.abiertas || 0} activas`}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                Total: {catRetencion.cantidad || 0} ({desgloseOcs.por_retencion_precio ?? 0} OCs) • <span className="font-medium text-emerald-700">{catRetencion.resueltas || 0} resueltas</span>
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
                  <div className={`rounded-lg p-2 transition ${(catRetraso.abiertas || 0) > 0 ? 'bg-orange-50 text-orange-700 group-hover:bg-orange-100' : 'bg-slate-100 text-slate-600'}`}>
                    <Clock className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-orange-600 transition" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {catRetraso.abiertas || 0}
                </span>
                <span className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums ${(catRetraso.abiertas || 0) > 0 ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {(catRetraso.abiertas || 0) === 1 ? '1 activa' : `${catRetraso.abiertas || 0} activas`}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                Total: {catRetraso.cantidad || 0} ({desgloseOcs.por_retraso ?? 0} OCs) • <span className="font-medium text-emerald-700">{catRetraso.resueltas || 0} resueltas</span>
              </p>
            </Link>
          </div>

          {/* Gráficos principales */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Gráfico de Incidencias Activas por Causa */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Distribución de Incidencias Activas por Causa</h2>
                  <p className="text-xs text-slate-500">Proporción y volumen de anomalías pendientes de resolución ({totalActivasPareto} activas)</p>
                </div>
                <Link
                  to="/incidencias"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  Ver alertas <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="h-64 w-full">
                {totalActivasPareto === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                    <CheckCircle2 className="mb-2 h-7 w-7 text-emerald-600" />
                    <p className="text-sm font-semibold text-slate-800">Sin incidencias activas</p>
                    <p className="mt-0.5 text-slate-500">
                      Todas las anomalías detectadas en este período han sido resueltas o las órdenes ingresaron conformes.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={paretoActivas}
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
                          `${value} activa(s) (${props.payload.porcentajeActivas}% del total activo)`,
                          'Pendientes'
                        ]}
                      />
                      <Bar dataKey="activas" radius={[6, 6, 0, 0]} maxBarSize={56}>
                        {paretoActivas.map(entry => (
                          <Cell key={entry.tipo} fill={COLORES_PARETO[entry.tipo] || '#0f766e'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
                {paretoActivas.map(item => (
                  <div key={item.tipo} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-medium text-slate-500">
                      {item.etiqueta}
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">
                        {item.activas} activas ({item.porcentajeActivas}%)
                      </span>
                      <span className="text-[11px] text-slate-500 tabular-nums">{item.resueltas} resueltas</span>
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
                  <p className="text-xs text-slate-500">Índice de confianza y cumplimiento por proveedor</p>
                </div>
                <Link
                  to="/reportes"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  Analítica <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {labsConConfianza.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                  Sin datos de proveedores aún
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {labsConConfianza.map(lab => {
                    const badgeConfianza =
                      lab.pct_confianza >= 90
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : lab.pct_confianza >= 75
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200';

                    return (
                      <div key={lab.laboratorio} className="flex items-center justify-between py-3 first:pt-1 last:pb-1">
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-slate-900">{lab.laboratorio}</p>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${badgeConfianza}`}>
                              {lab.pct_confianza}% confianza
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                            {lab.total_ocs} OCs • {lab.ocs_conformes} conformes ({lab.ocs_con_fallas} con obs.)
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
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 p-3 text-xs">
                <div>
                  <span className="font-medium text-slate-800">Confiabilidad Promedio de Proveedores</span>
                  <p className="text-[11px] text-slate-500">Evaluación de recepciones conformes sin incidencias</p>
                </div>
                <span className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 tabular-nums">
                  {promedioConfianzaGlobal}%
                </span>
              </div>
            </div>
          </div>

          {/* Tabla de Alertas Tempranas Pendientes */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Alertas Tempranas Pendientes</h2>
                <p className="text-xs text-slate-500">
                  Anomalías logísticas no resueltas en espera de atención ({totalAlertas} pendientes)
                </p>
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

            {totalAlertas === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">Sin incidencias pendientes</p>
                <p className="mt-1 text-xs text-slate-500">
                  Todas las anomalías registradas en este período han sido regularizadas y resueltas.
                </p>
              </div>
            ) : (
              <>
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
                      {alertasPaginadas.map(inc => {
                        const tMeta = TIPO_INCIDENCIA_META[inc.tipo_incidencia] || {};
                        const eMeta = ESTADO_GESTION_META[inc.estado_gestion] || {};
                        const compromiso = inc.fecha_compromiso_entrega
                          ? obtenerEstadoCompromiso(inc.fecha_compromiso_entrega, inc.tipo_incidencia)
                          : null;
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
                              {compromiso && (
                                <div className="mt-1">
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${compromiso.badge}`}>
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    {compromiso.texto}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="max-w-xs px-5 py-3">
                              <div className="truncate font-medium text-slate-900">{inc.nombre_producto}</div>
                              <div className="truncate text-[11px] text-slate-500">{inc.laboratorio_nombre}</div>
                              {Number(inc.cantidad_regularizada || 0) > 0 && Number(inc.cantidad_afectada || 0) > 0 && (
                                <div className="mt-1 text-[10px] font-medium text-teal-700">
                                  Entregado: {inc.cantidad_regularizada}/{inc.cantidad_afectada} unid.
                                </div>
                              )}
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

                {/* Paginación de 10 incidencias */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
                  <div>
                    Mostrando <span className="font-semibold text-slate-900">{(paginaAlertas - 1) * ALERTAS_POR_PAGINA + 1}</span> a{' '}
                    <span className="font-semibold text-slate-900">{Math.min(paginaAlertas * ALERTAS_POR_PAGINA, totalAlertas)}</span> de{' '}
                    <span className="font-semibold text-slate-900">{totalAlertas}</span> incidencias pendientes
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={paginaAlertas <= 1}
                      onClick={() => setPaginaAlertas(p => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>Anterior</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPaginasAlertas }, (_, i) => i + 1).map(num => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setPaginaAlertas(num)}
                          className={`h-7 w-7 rounded-md text-xs font-medium tabular-nums transition ${
                            paginaAlertas === num
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={paginaAlertas >= totalPaginasAlertas}
                      onClick={() => setPaginaAlertas(p => Math.min(totalPaginasAlertas, p + 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>Siguiente</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
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
