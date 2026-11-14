import React, { useEffect, useState, useCallback } from 'react';
import {
  Truck,
  Building2,
  Clock,
  Search,
  CheckCircle2,
  AlertTriangle,
  Save,
  RotateCcw,
  Info,
  Calendar,
  Check,
  ChevronRight
} from 'lucide-react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { formatearFechaCortaLima } from '../utils/formatters';

export default function ProveedoresPage() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPlazo, setFiltroPlazo] = useState('TODOS');
  const [ediciones, setEdiciones] = useState({});
  const [guardandoId, setGuardandoId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = busqueda.trim() ? `?q=${encodeURIComponent(busqueda.trim())}` : '';
      const res = await api.get(`/api/laboratorios${qs}`);
      setLista(res.data || []);
      // Inicializar estado de ediciones
      const eds = {};
      for (const lab of res.data || []) {
        eds[lab.id] = Number(lab.plazo_entrega_dias || 3);
      }
      setEdiciones(eds);
    } catch (err) {
      setFeedback({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, [busqueda]);

  useEffect(() => {
    const timer = setTimeout(cargar, 250);
    return () => clearTimeout(timer);
  }, [cargar]);

  const handleCambiarPlazo = (id, nuevoValor) => {
    const valNum = Math.min(60, Math.max(1, parseInt(nuevoValor, 10) || 1));
    setEdiciones(prev => ({ ...prev, [id]: valNum }));
  };

  const handleAjustarDelta = (id, delta) => {
    const actual = ediciones[id] ?? 3;
    handleCambiarPlazo(id, actual + delta);
  };

  const guardarPlazo = async (lab) => {
    const nuevoPlazo = ediciones[lab.id];
    if (nuevoPlazo === undefined || nuevoPlazo === lab.plazo_entrega_dias) return;

    setGuardandoId(lab.id);
    setFeedback(null);
    try {
      const res = await api.patch(`/api/laboratorios/${lab.id}`, {
        plazo_entrega_dias: nuevoPlazo
      });
      setFeedback({
        tipo: 'ok',
        texto: res.mensaje || `Plazo de ${lab.razon_social} actualizado a ${nuevoPlazo} días.`
      });
      // Actualizar registro en lista
      setLista(prev => prev.map(l => (l.id === lab.id ? { ...l, ...res.data } : l)));
    } catch (err) {
      setFeedback({ tipo: 'error', texto: err.message });
    } finally {
      setGuardandoId(null);
    }
  };

  // Filtrado de lista por plazo
  const listaFiltrada = lista.filter(lab => {
    const plazo = ediciones[lab.id] ?? lab.plazo_entrega_dias;
    if (filtroPlazo === 'RAPIDO') return plazo <= 2;
    if (filtroPlazo === 'ESTANDAR') return plazo === 3;
    if (filtroPlazo === 'EXTENDIDO') return plazo >= 4;
    return true;
  });

  // Estadísticas generales
  const totalLabs = lista.length;
  const promedioDias = totalLabs > 0
    ? (lista.reduce((acc, l) => acc + Number(l.plazo_entrega_dias || 3), 0) / totalLabs).toFixed(1)
    : '3.0';
  const labsConformes = lista.filter(l => Number(l.tasa_cumplimiento_pct || 100) >= 90).length;
  const labsConRetrasos = lista.filter(l => Number(l.ordenes_con_retraso || 0) > 0).length;

  return (
    <Layout onSyncComplete={cargar}>
      {/* Encabezado descriptivo */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Plazos de Entrega por Laboratorio Proveedor</h1>
            <p className="mt-1 text-xs text-slate-500">
              Configuración de los días de demora acordados para la entrega de órdenes de compra. Si una orden supera estos días, el sistema alertará automáticamente para el reclamo logístico correspondiente.
            </p>
          </div>
        </div>

        {/* Tarjeta informativa para personal */}
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-4 text-xs text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
          <div className="leading-relaxed">
            <span className="font-semibold text-teal-900">Personalización independiente de tiempos de abastecimiento: </span>
            Por defecto, todo nuevo laboratorio se registra con <strong>3 días</strong> de plazo acordado. Los operadores y trabajadores pueden modificar los días de entrega de cada proveedor en cualquier momento. Al guardar, las órdenes de compra activas del laboratorio se re-auditan de forma automática.
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-xs ${
            feedback.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.texto}
        </div>
      )}

      {/* Tarjetas resumen KPI */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-medium">Laboratorios Registrados</span>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{totalLabs}</div>
          <p className="mt-1 text-[11px] text-slate-400">Proveedores en el catálogo ERP</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-medium">Plazo Promedio Acordado</span>
            <Clock className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">{promedioDias} d</div>
          <p className="mt-1 text-[11px] text-slate-400">Días de lead time promedio</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-medium">Alta Confiabilidad (≥ 90%)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">{labsConformes}</div>
          <p className="mt-1 text-[11px] text-slate-400">Proveedores con entregas a tiempo</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-medium">Con Retrasos Observados</span>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-orange-700 tabular-nums">{labsConRetrasos}</div>
          <p className="mt-1 text-[11px] text-slate-400">Proveedores con órdenes demoradas</p>
        </div>
      </div>

      {/* Barra de filtros y búsqueda */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por laboratorio, RUC o dirección..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
          />
        </div>

        {/* Filtro rápido por plazo */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500 mr-1">Filtrar plazo:</span>
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'RAPIDO', label: '1 - 2 días' },
            { id: 'ESTANDAR', label: '3 días (Default)' },
            { id: 'EXTENDIDO', label: '4+ días' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroPlazo(f.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                filtroPlazo === f.id
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Proveedores y Plazos */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {cargando && lista.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Cargando catálogo de laboratorios...</div>
        ) : listaFiltrada.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No se encontraron laboratorios con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Laboratorio Proveedor</th>
                  <th className="px-5 py-3.5 text-center">Plazo de Entrega Acordado</th>
                  <th className="px-5 py-3.5 text-center">Cumplimiento Histórico</th>
                  <th className="px-5 py-3.5">Última Modificación</th>
                  <th className="px-5 py-3.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {listaFiltrada.map(lab => {
                  const plazoActual = ediciones[lab.id] ?? Number(lab.plazo_entrega_dias || 3);
                  const haCambiado = plazoActual !== Number(lab.plazo_entrega_dias || 3);
                  const estaGuardando = guardandoId === lab.id;

                  // Categoría visual de plazo
                  let badgePlazo = 'bg-slate-100 text-slate-700 border-slate-200';
                  let textoPlazo = 'Estándar';
                  if (plazoActual <= 2) {
                    badgePlazo = 'bg-blue-50 text-blue-700 border-blue-200';
                    textoPlazo = 'Rápido';
                  } else if (plazoActual >= 4) {
                    badgePlazo = 'bg-amber-50 text-amber-700 border-amber-200';
                    textoPlazo = 'Extendido';
                  }

                  const cumplimiento = Number(lab.tasa_cumplimiento_pct ?? 100);
                  let colorCumplimiento = 'text-emerald-700';
                  let bgBarra = 'bg-emerald-500';
                  if (cumplimiento < 75) {
                    colorCumplimiento = 'text-rose-700';
                    bgBarra = 'bg-rose-500';
                  } else if (cumplimiento < 90) {
                    colorCumplimiento = 'text-amber-700';
                    bgBarra = 'bg-amber-500';
                  }

                  return (
                    <tr key={lab.id} className="hover:bg-slate-50/60 transition">
                      {/* Laboratorio */}
                      <td className="px-5 py-4 align-top">
                        <div className="font-semibold text-slate-900">{lab.razon_social}</div>
                        {lab.nombre_comercial && lab.nombre_comercial !== lab.razon_social && (
                          <div className="text-[11px] text-slate-600">{lab.nombre_comercial}</div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          {lab.ruc && <span>RUC: {lab.ruc}</span>}
                          {lab.direccion && <span>• {lab.direccion}</span>}
                        </div>
                      </td>

                      {/* Selector de Plazo de Entrega */}
                      <td className="px-5 py-4 align-top text-center">
                        <div className="inline-flex flex-col items-center">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAjustarDelta(lab.id, -1)}
                              disabled={plazoActual <= 1}
                              className="h-7 w-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                              title="Reducir 1 día"
                            >
                              -
                            </button>
                            <div className="relative">
                              <input
                                type="number"
                                min={1}
                                max={60}
                                value={plazoActual}
                                onChange={e => handleCambiarPlazo(lab.id, e.target.value)}
                                className="w-16 rounded-lg border border-slate-300 bg-white py-1 text-center text-sm font-bold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAjustarDelta(lab.id, 1)}
                              disabled={plazoActual >= 60}
                              className="h-7 w-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                              title="Aumentar 1 día"
                            >
                              +
                            </button>
                            <span className="text-xs font-medium text-slate-600 ml-1">día(s)</span>
                          </div>

                          {/* Botones de acceso rápido */}
                          <div className="mt-2 flex items-center gap-1">
                            {[2, 3, 5, 7].map(dias => (
                              <button
                                key={dias}
                                type="button"
                                onClick={() => handleCambiarPlazo(lab.id, dias)}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                                  plazoActual === dias
                                    ? 'bg-teal-700 text-white'
                                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {dias}d
                              </button>
                            ))}
                          </div>

                          <div className="mt-1.5">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgePlazo}`}>
                              {textoPlazo} ({plazoActual} d)
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Cumplimiento Histórico */}
                      <td className="px-5 py-4 align-top text-center">
                        <div className={`text-sm font-bold tabular-nums ${colorCumplimiento}`}>
                          {cumplimiento}%
                        </div>
                        <div className="mx-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full ${bgBarra}`} style={{ width: `${cumplimiento}%` }} />
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400 tabular-nums">
                          {lab.ordenes_conformes} de {lab.total_ordenes} conformes
                          {Number(lab.ordenes_con_retraso || 0) > 0 && (
                            <span className="text-rose-600 font-medium"> ({lab.ordenes_con_retraso} demoradas)</span>
                          )}
                        </div>
                      </td>

                      {/* Trazabilidad de modificación */}
                      <td className="px-5 py-4 align-top text-[11px] text-slate-500">
                        {lab.updated_at ? (
                          <>
                            <div className="font-medium text-slate-700">
                              {lab.updated_by_nombre || 'Personal Logístico'}
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              {formatearFechaCortaLima(lab.updated_at)}
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-400 italic">Configuración inicial por defecto (3 d)</div>
                        )}
                      </td>

                      {/* Botón Guardar */}
                      <td className="px-5 py-4 align-top text-right">
                        {haCambiado ? (
                          <button
                            type="button"
                            onClick={() => guardarPlazo(lab)}
                            disabled={estaGuardando}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50 transition animate-pulse"
                          >
                            <Save className="h-3.5 w-3.5" />
                            <span>{estaGuardando ? 'Guardando...' : 'Guardar'}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span>Al día</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
