import React, { useState } from 'react';
import { X, CheckCircle2, FileText, Calendar, Clock, AlertTriangle, ArrowRight, Package } from 'lucide-react';
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

  // Precio unitario para el cálculo automático de recuperación
  const precioUnitario = Number(
    incidencia.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO'
      ? (incidencia.precio_facturado || incidencia.precio_pactado || 0)
      : (incidencia.precio_pactado || 0)
  );

  const [estadoGestion, setEstadoGestion] = useState(incidencia.estado_gestion || 'EN_GESTION');
  const [documentoRespaldo, setDocumentoRespaldo] = useState(incidencia.documento_respaldo || '');

  // Cantidad regularizada inicial
  const [cantidadRegularizada, setCantidadRegularizada] = useState(() => {
    if (incidencia.cantidad_regularizada !== undefined && incidencia.cantidad_regularizada !== null) {
      return Number(incidencia.cantidad_regularizada);
    }
    // Si la incidencia ya estaba resuelta con capital liberado, inferir unidades
    if (incidencia.estado_gestion === 'RESUELTA_CAPITAL_LIBERADO' && maxUnidades > 0) {
      return maxUnidades;
    }
    return 0;
  });

  // Recordatorio de entrega / fecha compromiso
  const [fechaCompromiso, setFechaCompromiso] = useState(() => aFechaInputString(incidencia.fecha_compromiso_entrega));
  const [recordatorioNota, setRecordatorioNota] = useState(incidencia.recordatorio_nota || '');

  const [observaciones, setObservaciones] = useState(incidencia.observaciones_gestion || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const tieneUnidadesFisicas = incidencia.tipo_incidencia === 'ENTREGA_INCOMPLETA' || incidencia.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO';

  // Monto calculado automáticamente según la cantidad de unidades regularizadas
  const montoCalculado = tieneUnidadesFisicas
    ? Number((Number(cantidadRegularizada || 0) * precioUnitario).toFixed(2))
    : Number(incidencia.monto_liberado || 0);

  const unidadesPendientes = Math.max(0, maxUnidades - Number(cantidadRegularizada || 0));
  const porcentajeAvance = maxUnidades > 0
    ? Math.min(100, Math.round((Number(cantidadRegularizada || 0) / maxUnidades) * 100))
    : 0;

  const estadoCompromiso = fechaCompromiso ? obtenerEstadoCompromiso(fechaCompromiso) : null;

  const tipoMeta = TIPO_INCIDENCIA_META[incidencia.tipo_incidencia] || {
    etiqueta: incidencia.tipo_incidencia,
    badge: 'bg-slate-100 text-slate-700 border-slate-200'
  };

  const handleCambiarCantidad = (nuevaCant) => {
    const cantNum = Math.max(0, parseInt(nuevaCant, 10) || 0);
    setCantidadRegularizada(cantNum);

    // Sugerencia inteligente de estado según cantidad regularizada
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
      const payload = {
        estado_gestion: estadoGestion,
        documento_respaldo: documentoRespaldo.trim() || null,
        cantidad_regularizada: Number(cantidadRegularizada || 0),
        monto_liberado: montoCalculado,
        fecha_compromiso_entrega: fechaCompromiso ? fechaCompromiso : null,
        recordatorio_nota: recordatorioNota.trim() || null,
        observaciones_gestion: observaciones.trim() || null
      };

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
              {incidencia.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO' ? (
                <>
                  <div>
                    <div className="text-[11px] text-slate-500">Precio pactado</div>
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
              ) : incidencia.tipo_incidencia === 'ENTREGA_INCOMPLETA' ? (
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

          {/* Estado de gestión */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Estado de gestión</label>
            <select
              value={estadoGestion}
              onChange={e => {
                const val = e.target.value;
                setEstadoGestion(val);
                // Si pasa a Resuelta y la cantidad regularizada estaba en 0, auto-completar el total
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

          {/* Gestión de faltantes por cantidad de unidades */}
          {tieneUnidadesFisicas && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-teal-700" />
                    {incidencia.tipo_incidencia === 'ENTREGA_INCOMPLETA'
                      ? 'Unidades faltantes entregadas / regularizadas'
                      : 'Unidades regularizadas / liberadas'}
                  </span>
                </label>
                <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                  Faltante total: <strong className="text-slate-800">{maxUnidades} unid.</strong>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Ajusta las unidades recibidas por lotes o entregas parciales. El sistema calcula automáticamente el capital recuperado.
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

                {/* Botones de acción rápida */}
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

              {/* Barra de progreso de regularización */}
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
                  Capital recuperado (calculado a {formatearMoneda(precioUnitario)}/unid):
                </span>
                <span className="font-bold text-teal-800 tabular-nums">
                  {formatearMoneda(montoCalculado)}
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
              {estadoCompromiso && (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${estadoCompromiso.badge}`}>
                  {estadoCompromiso.texto}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Registra cuándo acordó el proveedor enviar el saldo o lote faltante para avisar si se pasa del plazo.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={fechaCompromiso}
                onChange={e => setFechaCompromiso(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
              />

              {/* Botones de fecha rápida */}
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

          {/* Documento de respaldo */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                Documento de respaldo (Guía de reposición, Nota de crédito o N° Reclamo)
              </span>
            </label>
            <input
              type="text"
              placeholder="Ej. GR-REP-019 / NC-F001-00421 / REC-882"
              value={documentoRespaldo}
              onChange={e => setDocumentoRespaldo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
            />
          </div>

          {/* Observaciones y acuerdos con laboratorio */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Observaciones y acuerdos de gestión</label>
            <textarea
              rows={3}
              placeholder="Registra la coordinación con el proveedor, condiciones de entrega por partes o acuerdos de compensación..."
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
