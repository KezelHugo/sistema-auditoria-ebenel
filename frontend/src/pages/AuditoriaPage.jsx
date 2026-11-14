import React, { useEffect, useState, useCallback } from 'react';
import { Search, ShieldCheck, X } from 'lucide-react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import Paginacion from '../components/Paginacion';
import { formatearFechaLima } from '../utils/formatters';

export default function AuditoriaPage() {
  const [eventos, setEventos] = useState([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [accionesDisponibles, setAccionesDisponibles] = useState([]);
  const [accion, setAccion] = useState('TODAS');
  const [rol, setRol] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [detalleModal, setDetalleModal] = useState(null);

  const ITEMS_POR_PAGINA = 200;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        accion,
        rol,
        limit: String(ITEMS_POR_PAGINA),
        offset: String((pagina - 1) * ITEMS_POR_PAGINA)
      });
      if (busqueda.trim()) qs.set('q', busqueda.trim());
      const res = await api.get(`/api/admin/auditoria?${qs.toString()}`);
      setEventos(res.data || []);
      setTotalRegistros(res.total || 0);
      setAccionesDisponibles(res.acciones_disponibles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [accion, rol, busqueda, pagina]);

  useEffect(() => {
    setPagina(1);
  }, [accion, rol, busqueda]);

  useEffect(() => {
    const timer = setTimeout(cargar, 200);
    return () => clearTimeout(timer);
  }, [cargar]);

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por usuario, descripción, acción o ID..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accion}
            onChange={e => setAccion(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="TODAS">Todas las acciones</option>
            {accionesDisponibles.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={rol}
            onChange={e => setRol(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="TODOS">Todos los roles</option>
            <option value="GERENCIA">GERENCIA</option>
            <option value="EMPLEADO">EMPLEADO</option>
            <option value="SISTEMA">SISTEMA</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {cargando ? (
          <div className="p-10 text-center text-sm text-slate-500">Cargando bitácora de auditoría...</div>
        ) : eventos.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No se encontraron eventos de auditoría con los filtros seleccionados.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha y Hora</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Descripción del Evento</th>
                  <th className="px-4 py-3">IP Origen</th>
                  <th className="px-4 py-3 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {eventos.map(ev => (
                  <tr key={ev.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500 tabular-nums">
                      {formatearFechaLima(ev.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{ev.usuario_nombre || 'Sistema'}</div>
                      <div className="text-[11px] text-slate-500">
                        {ev.usuario_email || 'Proceso automático'} • <span className="font-medium">{ev.rol}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        <ShieldCheck className="h-3 w-3 text-teal-700" />
                        {ev.accion}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-3 text-slate-700">{ev.descripcion}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{ev.ip_origen || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {(ev.detalle_anterior || ev.detalle_nuevo) && (
                        <button
                          type="button"
                          onClick={() => setDetalleModal(ev)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Ver JSON
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacion
            paginaActual={pagina}
            totalRegistros={totalRegistros}
            porPagina={ITEMS_POR_PAGINA}
            alCambiarPagina={setPagina}
            nombreEntidad="eventos de auditoría"
          />
        </>
      )}
    </div>

      {detalleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{detalleModal.accion}</h3>
                <p className="text-xs text-slate-500">{formatearFechaLima(detalleModal.created_at)}</p>
              </div>
              <button type="button" onClick={() => setDetalleModal(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">Estado Anterior</div>
                <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
                  {JSON.stringify(detalleModal.detalle_anterior, null, 2) || 'null'}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">Estado Nuevo</div>
                <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
                  {JSON.stringify(detalleModal.detalle_nuevo, null, 2) || 'null'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
