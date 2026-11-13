import React, { useEffect, useState } from 'react';
import { X, AlertCircle, PackageCheck, Clock } from 'lucide-react';
import { api } from '../api/client';
import {
  formatearMoneda,
  formatearFechaLima,
  formatearFechaCortaLima,
  obtenerEstadoCompromiso,
  ESTADO_CONCILIACION_META,
  TIPO_INCIDENCIA_META,
  ESTADO_GESTION_META
} from '../utils/formatters';

export default function ModalDetalleOC({ ordenId, onClose, onGestionarIncidencia }) {
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const data = await api.get(`/api/ordenes-compra/${ordenId}`);
        if (!cancelado) setDetalle(data);
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [ordenId]);

  const conc = detalle?.conciliacion;
  const ingreso = detalle?.ingreso;
  const estadoConc = conc?.estado_conciliacion || 'PENDIENTE_RECEPCION';
  const metaEstado = ESTADO_CONCILIACION_META[estadoConc] || ESTADO_CONCILIACION_META.PENDIENTE_RECEPCION;

  const recPorItem = new Map();
  if (ingreso?.items_recibidos) {
    for (const r of ingreso.items_recibidos) {
      recPorItem.set(Number(r.item_nro), r);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold text-slate-900">
                {detalle ? detalle.numero_oc : 'Cargando orden...'}
              </h2>
              {detalle && (
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${metaEstado.badge}`}>
                  {metaEstado.etiqueta}
                </span>
              )}
            </div>
            {detalle && (
              <p className="mt-0.5 text-xs text-slate-500">
                {detalle.laboratorio_razon} (RUC {detalle.laboratorio_ruc || '—'}) • Estado ERP: {detalle.estado_erp}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {cargando ? (
            <div className="py-12 text-center text-sm text-slate-500">Cargando conciliación línea por línea...</div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          ) : (
            <div className="space-y-6">
              {/* Tarjetas de resumen superior */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Emisión / Pactada</div>
                  <div className="mt-1 text-xs font-semibold text-slate-900 tabular-nums">
                    {formatearFechaCortaLima(detalle.fecha_emision)} → {formatearFechaCortaLima(detalle.fecha_entrega_pactada)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Recepción Almacén</div>
                  <div className="mt-1 text-xs font-semibold text-slate-900 tabular-nums">
                    {ingreso ? `${ingreso.numero_guia_ingreso} (${formatearFechaLima(ingreso.fecha_recepcion_fisica)})` : 'Sin recepción física'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Total Pactado OC</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
                    {formatearMoneda(detalle.total)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Recepción Conforme</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
                    {conc?.fill_rate_unidades_pct !== null && conc?.fill_rate_unidades_pct !== undefined
                      ? `${Number(conc.fill_rate_unidades_pct).toFixed(1)}%`
                      : 'Pendiente'}
                  </div>
                </div>
              </div>

              {/* Incidencias de esta OC */}
              {detalle.incidencias?.length > 0 && (
                <div>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                    Incidencias detectadas en el cruce automático ({detalle.incidencias.length})
                  </h3>
                  <div className="space-y-2">
                    {detalle.incidencias.map(inc => {
                      const tMeta = TIPO_INCIDENCIA_META[inc.tipo_incidencia] || {};
                      const eMeta = ESTADO_GESTION_META[inc.estado_gestion] || {};
                      const compromiso = inc.fecha_compromiso_entrega
                        ? obtenerEstadoCompromiso(inc.fecha_compromiso_entrega)
                        : null;
                      return (
                        <div
                          key={inc.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tMeta.badge}`}>
                                {tMeta.etiqueta}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${eMeta.badge}`}>
                                {eMeta.etiqueta}
                              </span>
                              <span className="text-xs font-semibold text-slate-900">
                                {inc.sku ? `${inc.sku} — ` : ''}
                                {inc.nombre_producto}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{inc.observaciones_automaticas}</p>

                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                              {Number(inc.cantidad_regularizada || 0) > 0 && Number(inc.cantidad_afectada || 0) > 0 && (
                                <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
                                  Regularizado: {inc.cantidad_regularizada}/{inc.cantidad_afectada} unid.
                                </span>
                              )}
                              {compromiso && (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${compromiso.badge}`}>
                                  <Clock className="h-3 w-3 shrink-0" />
                                  {compromiso.texto}
                                </span>
                              )}
                            </div>

                            {inc.recordatorio_nota && (
                              <p className="mt-1 text-[11px] italic text-slate-500">
                                Acorde de entrega: "{inc.recordatorio_nota}"
                              </p>
                            )}

                            {inc.documento_respaldo && (
                              <p className="mt-1 text-[11px] font-medium text-teal-700">
                                Respaldo: {inc.documento_respaldo} • Liberado: {formatearMoneda(inc.monto_liberado)}
                              </p>
                            )}
                          </div>
                          {onGestionarIncidencia && (
                            <button
                              type="button"
                              onClick={() => onGestionarIncidencia(inc)}
                              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                            >
                              Gestionar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tabla de comparación línea por línea */}
              <div>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <PackageCheck className="h-4 w-4 text-teal-700" />
                  Cruce línea por línea (OC vs. Ingreso Físico)
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">SKU / Medicamento</th>
                        <th className="px-3 py-2.5 text-right">Solicitado</th>
                        <th className="px-3 py-2.5 text-right">Recibido</th>
                        <th className="px-3 py-2.5 text-right">P. Pactado</th>
                        <th className="px-3 py-2.5 text-right">P. Facturado</th>
                        <th className="px-3 py-2.5">Disposición</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80">
                      {detalle.items.map(it => {
                        const rec = recPorItem.get(Number(it.item_nro));
                        const faltante = rec ? Number(rec.cantidad_faltante || 0) : 0;
                        const retenido = rec?.estado_disposicion === 'RETENIDO_ZONA_DEVOLUCION';
                        return (
                          <tr key={it.item_nro} className={retenido ? 'bg-rose-50/40' : faltante > 0 ? 'bg-amber-50/40' : ''}>
                            <td className="px-3 py-2.5 text-slate-500 tabular-nums">{it.item_nro}</td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-slate-900">{it.nombre_comercial}</div>
                              <div className="text-[11px] text-slate-500">{it.sku} • {it.presentacion || '—'}</div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-slate-900 tabular-nums">
                              {it.cantidad_solicitada}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {rec ? (
                                <span className={faltante > 0 ? 'font-semibold text-amber-700' : 'font-medium text-slate-900'}>
                                  {rec.cantidad_recibida_fisica}
                                  {faltante > 0 && <span className="ml-1 text-[11px]">(-{faltante})</span>}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums">
                              {formatearMoneda(it.precio_unitario_pactado)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {rec ? (
                                <span
                                  className={
                                    Number(rec.precio_unitario_facturado) > Number(it.precio_unitario_pactado)
                                      ? 'font-semibold text-rose-700'
                                      : 'text-slate-700'
                                  }
                                >
                                  {formatearMoneda(rec.precio_unitario_facturado)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {!rec ? (
                                <span className="text-slate-400">Pendiente</span>
                              ) : retenido ? (
                                <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                                  Retenido Zona Devolución
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  Ingresado a Stock
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
