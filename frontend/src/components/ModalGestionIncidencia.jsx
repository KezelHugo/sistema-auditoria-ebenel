import React, { useState } from 'react';
import { X, CheckCircle2, FileText } from 'lucide-react';
import { api } from '../api/client';
import {
  formatearMoneda,
  TIPO_INCIDENCIA_META,
  ESTADO_GESTION_META
} from '../utils/formatters';

export default function ModalGestionIncidencia({ incidencia, onClose, onSaved }) {
  const [estadoGestion, setEstadoGestion] = useState(incidencia.estado_gestion || 'EN_GESTION');
  const [documentoRespaldo, setDocumentoRespaldo] = useState(incidencia.documento_respaldo || '');
  const [montoLiberado, setMontoLiberado] = useState(
    Number(incidencia.monto_liberado || 0) > 0
      ? String(incidencia.monto_liberado)
      : (incidencia.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO' || incidencia.tipo_incidencia === 'ENTREGA_INCOMPLETA'
          ? String(incidencia.valor_economico_afectado || 0)
          : '0')
  );
  const [observaciones, setObservaciones] = useState(incidencia.observaciones_gestion || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const tipoMeta = TIPO_INCIDENCIA_META[incidencia.tipo_incidencia] || {
    etiqueta: incidencia.tipo_incidencia,
    badge: 'bg-slate-100 text-slate-700 border-slate-200'
  };

  async function manejarGuardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const payload = {
        estado_gestion: estadoGestion,
        documento_respaldo: documentoRespaldo,
        monto_liberado: Number(montoLiberado || 0),
        observaciones_gestion: observaciones
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
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
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
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={manejarGuardar} className="space-y-5 px-6 py-5">
          {/* Resumen técnico detectado por el algoritmo */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
            <div className="font-semibold text-slate-800">{incidencia.nombre_producto}</div>
            <p className="mt-1 leading-relaxed text-slate-600">{incidencia.observaciones_automaticas}</p>

            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-3">
              <div>
                <div className="text-[11px] text-slate-500">Valor afectado</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {formatearMoneda(incidencia.valor_economico_afectado)}
                </div>
              </div>
              {incidencia.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO' ? (
                <>
                  <div>
                    <div className="text-[11px] text-slate-500">Precio pactado</div>
                    <div className="font-semibold text-slate-900 tabular-nums">{formatearMoneda(incidencia.precio_pactado)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Precio facturado</div>
                    <div className="font-semibold text-rose-700 tabular-nums">{formatearMoneda(incidencia.precio_facturado)}</div>
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
                    <div className="text-[11px] text-slate-500">Faltante</div>
                    <div className="font-semibold text-amber-700 tabular-nums">{incidencia.cantidad_afectada} unid.</div>
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
                    <div className="font-semibold text-slate-800">{ESTADO_GESTION_META[incidencia.estado_gestion]?.etiqueta}</div>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Estado de gestión</label>
              <select
                value={estadoGestion}
                onChange={e => {
                  const val = e.target.value;
                  setEstadoGestion(val);
                  if (val === 'RESUELTA_CAPITAL_LIBERADO' && Number(montoLiberado || 0) === 0 && Number(incidencia.valor_economico_afectado || 0) > 0) {
                    setMontoLiberado(String(incidencia.valor_economico_afectado));
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

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">Monto liberado / recuperado (S/)</label>
                {Number(incidencia.valor_economico_afectado) > 0 && (
                  <button
                    type="button"
                    onClick={() => setMontoLiberado(String(incidencia.valor_economico_afectado))}
                    className="text-[11px] font-medium text-teal-700 hover:underline"
                  >
                    100% ({formatearMoneda(incidencia.valor_economico_afectado)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={montoLiberado}
                onChange={e => setMontoLiberado(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                Documento de respaldo (Nota de Crédito, Guía de Reposición o Reclamo)
              </span>
            </label>
            <input
              type="text"
              placeholder="Ej. NC-F001-00421 / GR-REP-019"
              value={documentoRespaldo}
              onChange={e => setDocumentoRespaldo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Observaciones y acuerdos con laboratorio</label>
            <textarea
              rows={3}
              placeholder="Registra la coordinación con el laboratorio proveedor, autorización de nota de crédito o liberación física a stock..."
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
              <span>{guardando ? 'Registrando...' : 'Guardar resolución en auditoría'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
