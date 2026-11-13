import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Eye, Clock } from 'lucide-react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import ModalDetalleOC from '../components/ModalDetalleOC';
import ModalGestionIncidencia from '../components/ModalGestionIncidencia';
import {
  formatearMoneda,
  formatearFechaCortaLima,
  obtenerEstadoCompromiso,
  TIPO_INCIDENCIA_META,
  ESTADO_GESTION_META,
  SEVERIDAD_BADGE
} from '../utils/formatters';

export default function IncidenciasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tipoParam = searchParams.get('tipo');
  const [tipo, setTipo] = useState(
    tipoParam && ['TODAS', 'ENTREGA_INCOMPLETA', 'PRODUCTO_INMOVILIZADO_PRECIO', 'RETRASO_ENTREGA'].includes(tipoParam)
      ? tipoParam
      : 'TODAS'
  );
  const estadoParam = searchParams.get('estado');
  const [estado, setEstado] = useState(
    estadoParam && ['TODOS', 'ACTIVAS', 'ABIERTA', 'EN_GESTION', 'RESUELTA_CAPITAL_LIBERADO', 'CERRADA_SIN_RECUPERACION'].includes(estadoParam)
      ? estadoParam
      : 'ACTIVAS'
  );
  const [busqueda, setBusqueda] = useState('');
  const [lista, setLista] = useState([]);
  const [resumen, setResumen] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ordenDetalleId, setOrdenDetalleId] = useState(null);
  const [incidenciaModal, setIncidenciaModal] = useState(null);

  // Sincronizar estado local si cambia el query param en la URL
  useEffect(() => {
    const qTipo = searchParams.get('tipo');
    if (qTipo && ['TODAS', 'ENTREGA_INCOMPLETA', 'PRODUCTO_INMOVILIZADO_PRECIO', 'RETRASO_ENTREGA'].includes(qTipo)) {
      setTipo(qTipo);
    } else if (!qTipo) {
      setTipo('TODAS');
    }

    const qEstado = searchParams.get('estado');
    if (qEstado && ['TODOS', 'ACTIVAS', 'ABIERTA', 'EN_GESTION', 'RESUELTA_CAPITAL_LIBERADO', 'CERRADA_SIN_RECUPERACION'].includes(qEstado)) {
      setEstado(qEstado);
    }
  }, [searchParams]);

  const cambiarTipo = (nuevoTipo) => {
    setTipo(nuevoTipo);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (nuevoTipo === 'TODAS') {
        p.delete('tipo');
      } else {
        p.set('tipo', nuevoTipo);
      }
      return p;
    });
  };

  const cambiarEstado = (nuevoEstado) => {
    setEstado(nuevoEstado);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (nuevoEstado === 'ACTIVAS') {
        p.delete('estado');
      } else {
        p.set('estado', nuevoEstado);
      }
      return p;
    });
  };

  const cargar = useCallback(async () => {
    setError('');
    setCargando(true);
    try {
      const qs = new URLSearchParams({
        tipo,
        estado,
        limit: '150'
      });
      if (busqueda.trim()) qs.set('q', busqueda.trim());
      const res = await api.get(`/api/incidencias?${qs.toString()}`);
      setLista(res.data || []);
      setResumen(res.resumen_tipos || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [tipo, estado, busqueda]);

  useEffect(() => {
    const timer = setTimeout(cargar, 200);
    return () => clearTimeout(timer);
  }, [cargar]);

  const TABS = [
    { id: 'TODAS', label: 'Todas las incidencias', count: resumen.total ?? 0 },
    { id: 'ENTREGA_INCOMPLETA', label: 'Entregas Incompletas', count: resumen.ENTREGA_INCOMPLETA ?? 0 },
    { id: 'PRODUCTO_INMOVILIZADO_PRECIO', label: 'Retención por Precio', count: resumen.PRODUCTO_INMOVILIZADO_PRECIO ?? 0 },
    { id: 'RETRASO_ENTREGA', label: 'Retrasos de Entrega', count: resumen.RETRASO_ENTREGA ?? 0 }
  ];

  return (
    <Layout onSyncComplete={cargar}>
      {/* Tabs por tipo de incidencia Pareto */}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => cambiarTipo(tab.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition ${
              tipo === tab.id
                ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                tipo === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por N° OC, SKU, producto o laboratorio..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          <select
            value={estado}
            onChange={e => cambiarEstado(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="ACTIVAS">Pendientes / En Gestión ({resumen.activas ?? 0})</option>
            <option value="TODOS">Todos los estados</option>
            <option value="ABIERTA">Solo Abiertas</option>
            <option value="EN_GESTION">Solo En Gestión</option>
            <option value="RESUELTA_CAPITAL_LIBERADO">Resueltas / Liberadas</option>
            <option value="CERRADA_SIN_RECUPERACION">Cerradas sin Recuperación</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
      )}

      {/* Tabla de incidencias */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {cargando ? (
          <div className="p-10 text-center text-sm text-slate-500">Cargando incidencias logísticas...</div>
        ) : lista.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No se encontraron incidencias con los filtros actuales.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">OC / Proveedor</th>
                  <th className="px-4 py-3">Alerta</th>
                  <th className="px-4 py-3">Producto / Detalle técnico</th>
                  <th className="px-4 py-3 text-right">Valor Afectado</th>
                  <th className="px-4 py-3 text-right">Liberado</th>
                  <th className="px-4 py-3">Estado / Respaldo</th>
                  <th className="px-4 py-3 text-right">Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {lista.map(inc => {
                  const tMeta = TIPO_INCIDENCIA_META[inc.tipo_incidencia] || {};
                  const eMeta = ESTADO_GESTION_META[inc.estado_gestion] || {};
                  const sevBadge = SEVERIDAD_BADGE[inc.severidad] || SEVERIDAD_BADGE.MEDIA;
                  const compromiso = inc.fecha_compromiso_entrega
                    ? obtenerEstadoCompromiso(inc.fecha_compromiso_entrega)
                    : null;
                  return (
                    <tr key={inc.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-semibold text-slate-900">{inc.numero_oc}</div>
                        <div className="mt-0.5 max-w-[170px] truncate text-[11px] text-slate-500">
                          {inc.laboratorio_nombre}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400 tabular-nums">
                          {formatearFechaCortaLima(inc.detectada_en)}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-top">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tMeta.badge}`}>
                          {tMeta.corto}
                        </span>
                        <div className="mt-1.5">
                          <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${sevBadge}`}>
                            Sev. {inc.severidad}
                          </span>
                        </div>
                        {compromiso && (
                          <div className="mt-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${compromiso.badge}`}>
                              <Clock className="h-3 w-3 shrink-0" />
                              {compromiso.texto}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="max-w-md px-4 py-3.5 align-top">
                        <div className="font-medium text-slate-900">
                          {inc.sku ? `${inc.sku} — ` : ''}
                          {inc.nombre_producto}
                        </div>
                        <p className="mt-1 leading-relaxed text-[11px] text-slate-600">{inc.observaciones_automaticas}</p>
                        {Number(inc.cantidad_regularizada || 0) > 0 && Number(inc.cantidad_afectada || 0) > 0 && (
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                            <span>Regularizado:</span>
                            <span>{inc.cantidad_regularizada} de {inc.cantidad_afectada} unid.</span>
                            {Number(inc.cantidad_afectada) - Number(inc.cantidad_regularizada) > 0 && (
                              <span className="font-normal text-amber-700">
                                (faltan {Number(inc.cantidad_afectada) - Number(inc.cantidad_regularizada)})
                              </span>
                            )}
                          </div>
                        )}
                        {inc.recordatorio_nota && (
                          <p className="mt-1 text-[11px] italic text-slate-600">
                            Compromiso: "{inc.recordatorio_nota}"
                          </p>
                        )}
                        {inc.observaciones_gestion && (
                          <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                            Seguimiento: {inc.observaciones_gestion}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right align-top font-semibold text-slate-900 tabular-nums">
                        {formatearMoneda(inc.valor_economico_afectado)}
                      </td>

                      <td className="px-4 py-3.5 text-right align-top font-semibold text-emerald-700 tabular-nums">
                        {formatearMoneda(inc.monto_liberado)}
                      </td>

                      <td className="px-4 py-3.5 align-top">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${eMeta.badge}`}>
                          {eMeta.etiqueta}
                        </span>
                        {inc.documento_respaldo && (
                          <div className="mt-1 text-[11px] font-medium text-teal-700">{inc.documento_respaldo}</div>
                        )}
                        {inc.gestionado_por_nombre && (
                          <div className="mt-0.5 text-[10px] text-slate-400">Por {inc.gestionado_por_nombre}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right align-top">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOrdenDetalleId(inc.orden_compra_id)}
                            title="Ver detalle completo de la OC"
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIncidenciaModal(inc)}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            Gestionar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
          onSaved={cargar}
        />
      )}
    </Layout>
  );
}
