import React, { useEffect, useState, useCallback } from 'react';
import { Search, Eye } from 'lucide-react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import ModalDetalleOC from '../components/ModalDetalleOC';
import ModalGestionIncidencia from '../components/ModalGestionIncidencia';
import {
  formatearMoneda,
  formatearFechaCortaLima,
  ESTADO_CONCILIACION_META
} from '../utils/formatters';

export default function OrdenesPage() {
  const [ordenes, setOrdenes] = useState([]);
  const [estadoConciliacion, setEstadoConciliacion] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ordenDetalleId, setOrdenDetalleId] = useState(null);
  const [incidenciaModal, setIncidenciaModal] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const qs = new URLSearchParams({ limit: '150' });
      if (estadoConciliacion) qs.set('estado_conciliacion', estadoConciliacion);
      if (busqueda.trim()) qs.set('q', busqueda.trim());
      const res = await api.get(`/api/ordenes-compra?${qs.toString()}`);
      setOrdenes(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [estadoConciliacion, busqueda]);

  useEffect(() => {
    const timer = setTimeout(cargar, 200);
    return () => clearTimeout(timer);
  }, [cargar]);

  return (
    <Layout onSyncComplete={cargar}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por N° OC, laboratorio o N° guía de ingreso..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
          />
        </div>

        <select
          value={estadoConciliacion}
          onChange={e => setEstadoConciliacion(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
        >
          <option value="">Todos los resultados de conciliación</option>
          <option value="CON_INCIDENCIAS">Con Incidencias</option>
          <option value="VENCIDA_SIN_ENTREGA">Vencidas sin Entrega</option>
          <option value="CONFORME">Conformes (100%)</option>
          <option value="PENDIENTE_RECEPCION">En Tránsito (Dentro de plazo)</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {cargando ? (
          <div className="p-10 text-center text-sm text-slate-500">Cargando órdenes de compra conciliadas...</div>
        ) : ordenes.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No se encontraron órdenes de compra con esos criterios.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">N° Orden / Emisión</th>
                  <th className="px-4 py-3">Laboratorio Proveedor</th>
                  <th className="px-4 py-3">Entrega Pactada / Guía</th>
                  <th className="px-4 py-3 text-right">Total OC</th>
                  <th className="px-4 py-3 text-right">Fill Rate</th>
                  <th className="px-4 py-3">Resultado Conciliación</th>
                  <th className="px-4 py-3 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {ordenes.map(oc => {
                  const conc = oc.conciliacion;
                  const estadoKey = conc?.estado_conciliacion || 'PENDIENTE_RECEPCION';
                  const eMeta = ESTADO_CONCILIACION_META[estadoKey] || ESTADO_CONCILIACION_META.PENDIENTE_RECEPCION;
                  return (
                    <tr
                      key={oc.id}
                      onClick={() => setOrdenDetalleId(oc.id)}
                      className="cursor-pointer transition hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{oc.numero_oc}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                          {formatearFechaCortaLima(oc.fecha_emision)} • {oc.items_count} líneas
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{oc.laboratorio_razon}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">RUC {oc.laboratorio_ruc || '—'}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-slate-700 tabular-nums">
                          Pactada: {formatearFechaCortaLima(oc.fecha_entrega_pactada)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {oc.ingreso ? `Ingreso: ${oc.ingreso.numero_guia_ingreso}` : 'Sin recepción aún'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-900 tabular-nums">
                        {formatearMoneda(oc.total)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-700 tabular-nums">
                        {conc?.fill_rate_unidades_pct !== null && conc?.fill_rate_unidades_pct !== undefined
                          ? `${Number(conc.fill_rate_unidades_pct).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${eMeta.badge}`}>
                          {eMeta.etiqueta}
                        </span>
                        {conc?.cantidad_incidencias > 0 && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            {conc.cantidad_incidencias} alerta(s) • {conc.resumen_reglas}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setOrdenDetalleId(oc.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Cruce</span>
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
