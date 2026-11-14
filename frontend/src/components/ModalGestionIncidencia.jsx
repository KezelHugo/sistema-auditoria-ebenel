import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  FileText,
  Calendar,
  Clock,
  AlertTriangle,
  ArrowRight,
  Package,
  RotateCcw,
  Check,
  Truck,
  ShieldCheck
} from 'lucide-react';
import { api } from '../api/client';
import {
  formatearMoneda,
  formatearFechaCortaLima,
  obtenerEstadoCompromiso,
  TIPO_INCIDENCIA_META,
  ESTADO_GESTION_META
} from '../utils/formatters';

function aFechaInputString(fechaIso) {
  if (!fechaIso) return '';
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sumarDiasFechaHoy(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ModalGestionIncidencia({ incidencia, onClose, onSaved }) {
  const maxUnidades = Number(incidencia.cantidad_afectada || 0);
  const esSobreprecio = incidencia.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO';
  const esFaltante = incidencia.tipo_incidencia === 'ENTREGA_INCOMPLETA';

  // Precio unitario para el cálculo automático de recuperación
  const precioUnitario = Number(
    esSobreprecio
      ? (incidencia.precio_facturado || incidencia.precio_pactado || 0)
      : (incidencia.precio_pactado || 0)
  );

  // Estados específicos para PRODUCTO_INMOVILIZADO_PRECIO:
  // Decisión: 'DEVOLVER' o 'ACEPTAR'
  const [decisionSobreprecio, setDecisionSobreprecio] = useState(() => {
    if (incidencia.estado_gestion === 'CERRADA_ACEPTADA') return 'ACEPTAR';
    if (incidencia.estado_gestion === 'PENDIENTE_RECOJO' || incidencia.estado_gestion === 'DEVUELTO') return 'DEVOLVER';
    if (incidencia.estado_gestion === 'RESUELTA_CAPITAL_LIBERADO') return 'ACEPTAR';
    return 'DEVOLVER'; // Por defecto para producto con discrepancia de precio retenido
  });

  // Si se devuelve: 'PENDIENTE_RECOJO' o 'DEVUELTO'
  const [subEstadoDevolucion, setSubEstadoDevolucion] = useState(() => {
    if (incidencia.estado_gestion === 'DEVUELTO') return 'DEVUELTO';
    return 'PENDIENTE_RECOJO';
  });

  // Fecha programada de recojo (opcional) para trazabilidad
  const [fechaRecojo, setFechaRecojo] = useState(() => aFechaInputString(incidencia.fecha_compromiso_entrega));
  const [notaRecojo, setNotaRecojo] = useState(incidencia.recordatorio_nota || '');

  // Estados generales (usados para ENTREGA_INCOMPLETA y RETRASO_ENTREGA)
  const [estadoGestion, setEstadoGestion] = useState(incidencia.estado_gestion || 'EN_GESTION');
  const [documentoRespaldo, setDocumentoRespaldo] = useState(incidencia.documento_respaldo || '');

  // Cantidad regularizada para faltantes
  const [cantidadRegularizada, setCantidadRegularizada] = useState(() => {
    if (incidencia.cantidad_regularizada !== undefined && incidencia.cantidad_regularizada !== null) {
      return Number(incidencia.cantidad_regularizada);
    }
    if (incidencia.estado_gestion === 'RESUELTA_CAPITAL_LIBERADO' && maxUnidades > 0) {
      return maxUnidades;
    }
    return 0;
  });

  // Recordatorio de entrega para faltantes / retrasos
  const [fechaCompromiso, setFechaCompromiso] = useState(() => aFechaInputString(incidencia.fecha_compromiso_entrega));
  const [recordatorioNota, setRecordatorioNota] = useState(incidencia.recordatorio_nota || '');

  const [observaciones, setObservaciones] = useState(incidencia.observaciones_gestion || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Cálculos automáticos para faltantes
  const montoCalculadoFaltante = esFaltante
    ? Number((Number(cantidadRegularizada || 0) * precioUnitario).toFixed(2))
    : Number(incidencia.monto_liberado || 0);

  const unidadesPendientes = Math.max(0, maxUnidades - Number(cantidadRegularizada || 0));
  const porcentajeAvance = maxUnidades > 0
    ? Math.min(100, Math.round((Number(cantidadRegularizada || 0) / maxUnidades) * 100))
    : 0;

  const estadoCompromisoFaltante = fechaCompromiso ? obtenerEstadoCompromiso(fechaCompromiso, incidencia.tipo_incidencia) : null;
  const estadoCompromisoRecojo = fechaRecojo ? obtenerEstadoCompromiso(fechaRecojo, 'PRODUCTO_INMOVILIZADO_PRECIO') : null;

  const tipoMeta = TIPO_INCIDENCIA_META[incidencia.tipo_incidencia] || {
    etiqueta: incidencia.tipo_incidencia,
    badge: 'bg-slate-100 text-slate-700 border-slate-200'
  };

  const handleCambiarCantidad = (nuevaCant) => {
    const cantNum = Math.max(0, parseInt(nuevaCant, 10) || 0);
    setCantidadRegularizada(cantNum);

    if (cantNum >= maxUnidades && maxUnidades > 0) {
      if (estadoGestion === 'ABIERTA' || estadoGestion === 'EN_GESTION') {
        setEstadoGestion('RESUELTA_CAPITAL_LIBERADO');
      }
    } else if (cantNum > 0 && cantNum < maxUnidades) {
      if (estadoGestion === 'ABIERTA') {
        setEstadoGestion('EN_GESTION');
      }
    }
  };

  const agregarUnidades = (delta) => {
    const actual = Number(cantidadRegularizada || 0);
    const nuevo = Math.min(maxUnidades, Math.max(0, actual + delta));
    handleCambiarCantidad(nuevo);
  };

  const regularizarTotal = () => {
    handleCambiarCantidad(maxUnidades);
    setEstadoGestion('RESUELTA_CAPITAL_LIBERADO');
  };

  async function manejarGuardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      let payload;

      if (esSobreprecio) {
        if (decisionSobreprecio === 'ACEPTAR') {
          payload = {
            estado_gestion: 'CERRADA_ACEPTADA',
            monto_liberado: Number(incidencia.valor_economico_afectado || 0),
            cantidad_regularizada: maxUnidades,
            fecha_programada_recojo: null,
            recordatorio_nota: null,
            documento_respaldo: documentoRespaldo.trim() || null,
            observaciones_gestion: observaciones.trim() || null
          };
        } else {
          // Devolver al proveedor
          const esDevuelto = subEstadoDevolucion === 'DEVUELTO';
          payload = {
            estado_gestion: subEstadoDevolucion,
            monto_liberado: esDevuelto ? Number(incidencia.valor_economico_afectado || 0) : 0,
            cantidad_regularizada: esDevuelto ? maxUnidades : 0,
            fecha_programada_recojo: fechaRecojo ? fechaRecojo : null,
            recordatorio_nota: notaRecojo.trim() || null,
            documento_respaldo: documentoRespaldo.trim() || null,
            observaciones_gestion: observaciones.trim() || null
          };
        }
      } else {
        // ENTREGA_INCOMPLETA y RETRASO_ENTREGA
        payload = {
          estado_gestion: estadoGestion,
          documento_respaldo: documentoRespaldo.trim() || null,
          cantidad_regularizada: Number(cantidadRegularizada || 0),
          monto_liberado: esFaltante ? montoCalculadoFaltante : Number(incidencia.monto_liberado || 0),
          fecha_compromiso_entrega: fechaCompromiso ? fechaCompromiso : null,
          recordatorio_nota: recordatorioNota.trim() || null,
          observaciones_gestion: observaciones.trim() || null
        };
      }

      const res = await api.patch(`/api/incidencias/${incidencia.id}`, payload);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]">
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Cabecera del modal */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-slate-900">{incidencia.numero_oc}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tipoMeta.badge}`}>
                {tipoMeta.etiqueta}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {incidencia.laboratorio_nombre} {incidencia.sku ? `• SKU ${incidencia.sku}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={manejarGuardar} className="space-y-5 px-6 py-5">
          {/* Resumen técnico detectado */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
            <div className="font-semibold text-slate-800">{incidencia.nombre_producto}</div>
            <p className="mt-1 leading-relaxed text-slate-600">{incidencia.observaciones_automaticas}</p>

            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-3">
              <div>
                <div className="text-[11px] text-slate-500">Valor afectado total</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {formatearMoneda(incidencia.valor_economico_afectado)}
                </div>
              </div>
              {esSobreprecio ? (
                <>
                  <div>
                    <div className="text-[11px] text-slate-500">Precio pactado OC</div>
                    <div className="font-semibold text-slate-900 tabular-nums">
                      {formatearMoneda(incidencia.precio_pactado)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Precio facturado</div>
                    <div className="font-semibold text-rose-700 tabular-nums">
                      {formatearMoneda(incidencia.precio_facturado)}
                    </div>
                  </div>
                </>
              ) : esFaltante ? (
                <>
                  <div>
                    <div className="text-[11px] text-slate-500">Solicitado / Recibido</div>
                    <div className="font-semibold text-slate-900 tabular-nums">
                      {incidencia.cantidad_solicitada} / {incidencia.cantidad_recibida} unid.
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Faltante original</div>
                    <div className="font-semibold text-amber-700 tabular-nums">
                      {incidencia.cantidad_afectada} unid.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-[11px] text-slate-500">Demora registrada</div>
                    <div className="font-semibold text-orange-700 tabular-nums">{incidencia.dias_retraso} día(s)</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Estado actual</div>
                    <div className="font-semibold text-slate-800">
                      {ESTADO_GESTION_META[incidencia.estado_gestion]?.etiqueta}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* ============================================================== */}
          {/* GESTIÓN EXCLUSIVA DE PRODUCTO INMOVILIZADO POR SOBREPRECIO     */}
          {/* ============================================================== */}
          {esSobreprecio ? (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Decisión de Disposición del Producto con Sobreprecio
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Tarjeta Opción 1: Devolver al proveedor */}
                  <button
                    type="button"
                    onClick={() => setDecisionSobreprecio('DEVOLVER')}
                    className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
                      decisionSobreprecio === 'DEVOLVER'
                        ? 'border-orange-500 bg-orange-50/70 ring-2 ring-orange-500/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`rounded-lg p-1.5 ${decisionSobreprecio === 'DEVOLVER' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <RotateCcw className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-900">Devolver al Proveedor</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${decisionSobreprecio === 'DEVOLVER' ? 'bg-orange-200 text-orange-900' : 'bg-slate-100 text-slate-500'}`}>
                        Rechazar sobreprecio
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                      No se acepta el precio facturado. La mercadería se mantiene en cuarentena para su retiro por el laboratorio.
                    </p>
                  </button>

                  {/* Tarjeta Opción 2: Aceptar sobreprecio */}
                  <button
                    type="button"
                    onClick={() => setDecisionSobreprecio('ACEPTAR')}
                    className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
                      decisionSobreprecio === 'ACEPTAR'
                        ? 'border-teal-600 bg-teal-50/70 ring-2 ring-teal-600/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`rounded-lg p-1.5 ${decisionSobreprecio === 'ACEPTAR' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-900">Aceptar Sobreprecio</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${decisionSobreprecio === 'ACEPTAR' ? 'bg-teal-200 text-teal-900' : 'bg-slate-100 text-slate-500'}`}>
                        Cierra incidencia
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                      Se autoriza la compra al nuevo precio. La mercadería se libera de cuarentena y pasa a stock disponible.
                    </p>
                  </button>
                </div>
              </div>

              {/* FLUJO SI SE DECIDE DEVOLVER */}
              {decisionSobreprecio === 'DEVOLVER' && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/30 p-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-800">
                      Estado de la devolución física
                    </label>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                          subEstadoDevolucion === 'PENDIENTE_RECOJO'
                            ? 'border-orange-500 bg-white shadow-sm ring-1 ring-orange-400'
                            : 'border-slate-200 bg-white/70 hover:bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="subEstadoDevolucion"
                          value="PENDIENTE_RECOJO"
                          checked={subEstadoDevolucion === 'PENDIENTE_RECOJO'}
                          onChange={() => setSubEstadoDevolucion('PENDIENTE_RECOJO')}
                          className="mt-0.5 text-orange-600 focus:ring-orange-500"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-900">Pendiente de Recojo</div>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            En zona de devolución (almacén), esperando retiro por el laboratorio. (Incidencia Activa)
                          </p>
                        </div>
                      </label>

                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                          subEstadoDevolucion === 'DEVUELTO'
                            ? 'border-emerald-600 bg-white shadow-sm ring-1 ring-emerald-500'
                            : 'border-slate-200 bg-white/70 hover:bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="subEstadoDevolucion"
                          value="DEVUELTO"
                          checked={subEstadoDevolucion === 'DEVUELTO'}
                          onChange={() => setSubEstadoDevolucion('DEVUELTO')}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-900">Devuelto al Proveedor</div>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Bultos retirados físicamente con Guía de Devolución / NC emitida. (Incidencia Resuelta)
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Fecha de recogida programada (opcional para trazabilidad) */}
                  <div className="rounded-lg border border-orange-200/80 bg-white p-3.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800">
                        <span className="inline-flex items-center gap-1.5">
                          <Truck className="h-4 w-4 text-orange-700" />
                          Fecha programada de recojo por el proveedor (Opcional)
                        </span>
                      </label>
                      {estadoCompromisoRecojo && (
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${estadoCompromisoRecojo.badge}`}>
                          {estadoCompromisoRecojo.texto}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Fecha acordada para que el transporte o courier del laboratorio recoja los bultos retenidos.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={fechaRecojo}
                        onChange={e => setFechaRecojo(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                      />

                      {/* Botones de fecha rápida */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFechaRecojo(sumarDiasFechaHoy(3))}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                        >
                          +3 días
                        </button>
                        <button
                          type="button"
                          onClick={() => setFechaRecojo(sumarDiasFechaHoy(7))}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                        >
                          +7 días (1 sem)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFechaRecojo(sumarDiasFechaHoy(15))}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                        >
                          +15 días
                        </button>
                        {fechaRecojo && (
                          <button
                            type="button"
                            onClick={() => setFechaRecojo('')}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50"
                          >
                            Quitar fecha
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <input
                        type="text"
                        placeholder="Nota de coordinación de recojo (ej. 'Courier del proveedor pasará en turno mañana / Contacto: Sr. López 987654321')"
                        value={notaRecojo}
                        onChange={e => setNotaRecojo(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                      />
                    </div>
                  </div>

                  {subEstadoDevolucion === 'DEVUELTO' && (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                      <span className="text-emerald-900">
                        Capital regularizado al registrar devolución:
                      </span>
                      <span className="font-bold text-emerald-800 tabular-nums">
                        {formatearMoneda(incidencia.valor_economico_afectado)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* FLUJO SI SE DECIDE ACEPTAR */}
              {decisionSobreprecio === 'ACEPTAR' && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <div>
                      <div className="text-xs font-semibold text-teal-900">Sobreprecio Autorizado para Ingreso a Stock</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                        Las <strong>{maxUnidades} unidades</strong> retenidas se liberan de cuarentena y quedan disponibles en inventario al precio facturado de {formatearMoneda(incidencia.precio_facturado)}/unid. Al guardar, la incidencia se marcará como <strong>Sobreprecio Aceptado</strong> y se cerrará liberando el capital.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-teal-200/80 bg-white px-3 py-2 text-xs">
                    <span className="text-slate-600">Capital liberado a stock disponible:</span>
                    <span className="font-bold text-teal-800 tabular-nums">
                      {formatearMoneda(incidencia.valor_economico_afectado)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* GESTIÓN DE ENTREGAS INCOMPLETAS (FALTANTES) Y RETRASOS         */
            /* ============================================================== */
            <>
              {/* Estado de gestión estándar */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Estado de gestión</label>
                <select
                  value={estadoGestion}
                  onChange={e => {
                    const val = e.target.value;
                    setEstadoGestion(val);
                    if (val === 'RESUELTA_CAPITAL_LIBERADO' && Number(cantidadRegularizada || 0) === 0 && maxUnidades > 0) {
                      setCantidadRegularizada(maxUnidades);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                >
                  <option value="ABIERTA">Abierta</option>
                  <option value="EN_GESTION">En Gestión con Proveedor</option>
                  <option value="RESUELTA_CAPITAL_LIBERADO">Resuelta / Capital Liberado</option>
                  <option value="CERRADA_SIN_RECUPERACION">Cerrada sin Recuperación</option>
                </select>
              </div>

              {/* Editor de faltantes por cantidad de unidades */}
              {esFaltante && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-teal-700" />
                        Unidades faltantes entregadas / regularizadas
                      </span>
                    </label>
                    <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                      Faltante total: <strong className="text-slate-800">{maxUnidades} unid.</strong>
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Ajusta las unidades recibidas por partes o lotes. El sistema calcula automáticamente el capital recuperado.
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max={maxUnidades}
                      value={cantidadRegularizada}
                      onChange={e => handleCambiarCantidad(e.target.value)}
                      className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                    />
                    <span className="text-xs text-slate-600">unidades de {maxUnidades}</span>

                    <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                      {maxUnidades >= 5 && (
                        <button
                          type="button"
                          onClick={() => agregarUnidades(5)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          +5 unid
                        </button>
                      )}
                      {maxUnidades >= 10 && (
                        <button
                          type="button"
                          onClick={() => agregarUnidades(10)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          +10 unid
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={regularizarTotal}
                        className="rounded border border-teal-300 bg-teal-100/70 px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-200/80"
                      >
                        100% Total ({maxUnidades})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCambiarCantidad(0)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100"
                      >
                        0
                      </button>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span>
                        Entregado: <strong className="text-teal-800 tabular-nums">{cantidadRegularizada} unid.</strong> ({porcentajeAvance}%)
                      </span>
                      <span>
                        Pendiente restante: <strong className="text-amber-800 tabular-nums">{unidadesPendientes} unid.</strong>
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full transition-all duration-300 ${
                          porcentajeAvance >= 100 ? 'bg-emerald-600' : 'bg-teal-600'
                        }`}
                        style={{ width: `${porcentajeAvance}%` }}
                      />
                    </div>
                  </div>

                  {/* Equivalente económico automático */}
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-teal-200/80 bg-white px-3 py-2 text-xs">
                    <span className="text-slate-600">
                      Capital recuperado (a {formatearMoneda(precioUnitario)}/unid):
                    </span>
                    <span className="font-bold text-teal-800 tabular-nums">
                      {formatearMoneda(montoCalculadoFaltante)}
                    </span>
                  </div>
                </div>
              )}

              {/* Recordatorio de Entrega Variable (Opcional) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-600" />
                      Fecha de compromiso de entrega / Recordatorio (Opcional)
                    </span>
                  </label>
                  {estadoCompromisoFaltante && (
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${estadoCompromisoFaltante.badge}`}>
                      {estadoCompromisoFaltante.texto}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Registra cuándo acordó el proveedor enviar el saldo o lote faltante para dar aviso si se vence el plazo.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={fechaCompromiso}
                    onChange={e => setFechaCompromiso(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                  />

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFechaCompromiso(sumarDiasFechaHoy(3))}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                    >
                      +3 días
                    </button>
                    <button
                      type="button"
                      onClick={() => setFechaCompromiso(sumarDiasFechaHoy(7))}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                    >
                      +7 días (1 sem)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFechaCompromiso(sumarDiasFechaHoy(15))}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                    >
                      +15 días
                    </button>
                    {fechaCompromiso && (
                      <button
                        type="button"
                        onClick={() => setFechaCompromiso('')}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50"
                      >
                        Quitar recordatorio
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-2.5">
                  <input
                    type="text"
                    placeholder="Nota de coordinación (ej. 'Laboratorio despachará saldo por transporte terrestre el viernes')"
                    value={recordatorioNota}
                    onChange={e => setRecordatorioNota(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                  />
                </div>
              </div>
            </>
          )}

          {/* Documento de respaldo */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                {esSobreprecio
                  ? (decisionSobreprecio === 'ACEPTAR'
                      ? 'Documento de respaldo / N° Autorización Comercial'
                      : 'Documento de respaldo (Guía de Devolución / Acta / Nota de Crédito)')
                  : 'Documento de respaldo (Guía de reposición, Nota de crédito o N° Reclamo)'}
              </span>
            </label>
            <input
              type="text"
              placeholder={
                esSobreprecio
                  ? (decisionSobreprecio === 'ACEPTAR' ? 'Ej. AUT-PRECIO-04 / VB-GER-2026' : 'Ej. GR-DEV-00124 / ACTA-DEV-88 / NC-F001-00421')
                  : 'Ej. GR-REP-019 / NC-F001-00421 / REC-882'
              }
              value={documentoRespaldo}
              onChange={e => setDocumentoRespaldo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
            />
          </div>

          {/* Observaciones y acuerdos de gestión */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              {esSobreprecio && decisionSobreprecio === 'ACEPTAR'
                ? 'Justificación de aceptación de sobreprecio'
                : 'Observaciones y acuerdos de gestión con el proveedor'}
            </label>
            <textarea
              rows={3}
              placeholder={
                esSobreprecio && decisionSobreprecio === 'ACEPTAR'
                  ? 'Registra el sustento comercial (ej. Autorizado por alta demanda y rotación inmediata, o acuerdo de compensación posterior)...'
                  : 'Registra la coordinación con el proveedor, condiciones de entrega/recojo o acuerdos de compensación...'
              }
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{guardando ? 'Guardando...' : 'Guardar gestión en auditoría'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
