import React, { useEffect, useState, useCallback } from 'react';
import { Printer, Wallet, CheckCircle2, HelpCircle, PackageMinus } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { api } from '../api/client';
import Layout from '../components/Layout';
import Paginacion from '../components/Paginacion';
import { formatearMoneda } from '../utils/formatters';

export default function ReportesPage() {
  const [periodo, setPeriodo] = useState('todo');
  const [paginaTabla, setPaginaTabla] = useState(1);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const ITEMS_POR_PAGINA = 10;

  const [definicionAbierta, setDefinicionAbierta] = useState({
    capital: false,
    cumplimiento: false,
    faltantes: false,
    grafico: false
  });

  const toggleDefinicion = (clave) => {
    setDefinicionAbierta(prev => ({ ...prev, [clave]: !prev[clave] }));
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await api.get(`/api/reportes/rentabilidad?periodo=${periodo}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPaginaTabla(1);
  }, [periodo]);

  const rent = data?.rentabilidad || {};
  const abast = data?.resumen_abastecimiento || {};
  const falt = data?.resumen_faltantes || {};
  const evolucion = data?.evolucion_mensual || [];
  const labs = data?.ranking_laboratorios || [];

  const unidadesPendientes = Number(falt.unidades_pendientes ?? rent.faltantes_unidades_pendientes ?? 0);
  const productosPendientes = Number(falt.productos_pendientes ?? rent.faltantes_productos_pendientes ?? 0);
  const unidadesGestionadas = Number(falt.unidades_gestionadas ?? rent.faltantes_unidades_gestionadas ?? 0);
  const productosGestionados = Number(falt.productos_gestionados ?? rent.faltantes_productos_gestionados ?? 0);
  const totalProductosFaltantes = Number(falt.total_productos_afectados ?? (productosPendientes + productosGestionados));

  // Paginación de 10 proveedores por página
  const totalPaginasLabs = Math.max(1, Math.ceil(labs.length / ITEMS_POR_PAGINA));
  const paginaValidaLabs = Math.min(Math.max(1, paginaTabla), totalPaginasLabs);
  const inicioLabs = (paginaValidaLabs - 1) * ITEMS_POR_PAGINA;
  const labsPaginados = labs.slice(inicioLabs, inicioLabs + ITEMS_POR_PAGINA);

  const capLiberado = Number(rent.capital_inmovilizado_liberado_pen || 0);

  return (
    <Layout onSyncComplete={cargar}>
      {/* Cabecera de controles */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: 'todo', label: 'Histórico completo' },
            { id: 'mes_actual', label: 'Mes actual' },
            { id: '30d', label: 'Últimos 30 días' },
            { id: '7d', label: 'Últimos 7 días' }
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriodo(opt.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                periodo === opt.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
      )}

      {cargando && !data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Generando analítica gerencial...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Indicadores de Rentabilidad, Abastecimiento y Faltantes */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Card 1: Capital Inmovilizado Liberado */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">Capital Inmovilizado Liberado</span>
                  <button
                    type="button"
                    onClick={() => toggleDefinicion('capital')}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                      definicionAbierta.capital
                        ? 'border-teal-300 bg-teal-50 text-teal-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title="Ver explicación de este indicador"
                  >
                    <HelpCircle className="h-3 w-3" />
                    <span>{definicionAbierta.capital ? 'Ocultar' : '¿Qué es?'}</span>
                  </button>
                </div>
                <Wallet className="h-4 w-4 text-teal-700" />
              </div>

              <div className="mt-2.5 text-2xl font-bold text-slate-900 tabular-nums">
                {formatearMoneda(capLiberado)}
              </div>

              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                Pendiente por regularizar:{' '}
                <strong className="font-semibold text-rose-700">
                  {formatearMoneda(rent.capital_inmovilizado_pendiente_pen)}
                </strong>
              </p>

              {definicionAbierta.capital && (
                <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/70 p-3 text-xs leading-relaxed text-slate-700">
                  <div className="mb-1 font-semibold text-teal-900">¿Qué representa este valor?</div>
                  Dinero que estaba comprometido o retenido por sobreprecios facturados y que fue recuperado tras devolver el producto observado al proveedor o anularse el cobro con Nota de Crédito. Al liberarse, ese capital queda disponible como liquidez en caja para comprar nueva mercadería y no afectar las finanzas.
                </div>
              )}
            </div>

            {/* Card 2: Cumplimiento de Entregas (Órdenes) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">Cumplimiento de Entregas (Órdenes)</span>
                  <button
                    type="button"
                    onClick={() => toggleDefinicion('cumplimiento')}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                      definicionAbierta.cumplimiento
                        ? 'border-slate-400 bg-slate-100 text-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title="Ver explicación de este indicador"
                  >
                    <HelpCircle className="h-3 w-3" />
                    <span>{definicionAbierta.cumplimiento ? 'Ocultar' : '¿Qué es?'}</span>
                  </button>
                </div>
                <CheckCircle2 className="h-4 w-4 text-slate-700" />
              </div>

              <div className="mt-2.5 text-2xl font-bold text-slate-900 tabular-nums">
                {Number(abast.fill_rate_ordenes_pct ?? 100).toFixed(1)}%
              </div>

              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                <strong className="font-semibold text-emerald-700">{abast.ocs_conformes || 0} conformes</strong> de{' '}
                <strong className="font-semibold text-slate-800">{abast.ocs_recepcionadas || 0} recibidas</strong>
                {Number(abast.ocs_con_incidencias || 0) > 0 && (
                  <span> • <strong className="font-semibold text-rose-700">{abast.ocs_con_incidencias} observadas</strong></span>
                )}
              </p>

              {definicionAbierta.cumplimiento && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                  <div className="mb-1 font-semibold text-slate-900">¿Qué representa este valor?</div>
                  Nivel de servicio y efectividad de los laboratorios en la recepción física: porcentaje de órdenes de compra que ingresaron a almacén 100% conformes, sin unidades faltantes, sin sobrecostos facturados y dentro del plazo pactado.
                </div>
              )}
            </div>

            {/* Card 3: Productos Faltantes Pendientes de Gestión */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">Productos Faltantes Pendientes</span>
                  <button
                    type="button"
                    onClick={() => toggleDefinicion('faltantes')}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                      definicionAbierta.faltantes
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title="Ver explicación de este indicador"
                  >
                    <HelpCircle className="h-3 w-3" />
                    <span>{definicionAbierta.faltantes ? 'Ocultar' : '¿Qué es?'}</span>
                  </button>
                </div>
                <PackageMinus className="h-4 w-4 text-amber-600" />
              </div>

              <div className="mt-2.5 flex items-baseline gap-2">
                <span className={`text-2xl font-bold tabular-nums ${unidadesPendientes > 0 ? 'text-slate-900' : 'text-emerald-700'}`}>
                  {unidadesPendientes} unid.
                </span>
                <span className="text-xs font-medium text-slate-500">
                  ({productosPendientes} {productosPendientes === 1 ? 'producto' : 'productos'})
                </span>
              </div>

              {totalProductosFaltantes === 0 ? (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  Sin entregas incompletas registradas
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500 tabular-nums">
                  Gestionados exitosamente:{' '}
                  <strong className="font-semibold text-emerald-700">
                    {unidadesGestionadas} unid. ({productosGestionados} {productosGestionados === 1 ? 'producto' : 'productos'})
                  </strong>
                </p>
              )}

              {definicionAbierta.faltantes && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-slate-700">
                  <div className="mb-1 font-semibold text-amber-900">¿Qué representa este valor?</div>
                  Volumen de unidades y productos farmacéuticos no entregados por los laboratorios en la recepción física que se encuentran pendientes de reclamo o reposición para evitar quiebres de inventario. Abajo se registran las unidades que ya fueron regularizadas exitosamente (reposición física o Notas de Crédito) para asegurar la continuidad de las ventas comerciales.
                </div>
              )}
            </div>
          </div>

          {/* Gráfico de Evolución Mensual */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Evolución Mensual de Capital Inmovilizado vs. Liberado</h2>
                <p className="text-xs text-slate-500">Seguimiento en soles (PEN) por mes de emisión de Órdenes de Compra</p>
              </div>

              <button
                type="button"
                onClick={() => toggleDefinicion('grafico')}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                  definicionAbierta.grafico
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Ver significado de cada métrica del gráfico"
              >
                <HelpCircle className="h-3 w-3" />
                <span>{definicionAbierta.grafico ? 'Ocultar significado' : '¿Qué significa cada valor?'}</span>
              </button>
            </div>

            <div className="h-72 w-full">
              {evolucion.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                  Sin datos históricos suficientes para graficar
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evolucion} margin={{ top: 10, right: 20, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      formatter={v => formatearMoneda(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="capital_inmovilizado" name="Capital Inmovilizado" fill="#be123c" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="capital_liberado" name="Capital Liberado" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="faltantes_valor" name="Valor Faltantes" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Guía explicativa de cada métrica del gráfico */}
            {definicionAbierta.grafico && (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
                {/* Capital Inmovilizado */}
                <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-rose-900">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-700" />
                    <span>Capital Inmovilizado</span>
                  </div>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    Mercadería recibida pero retenida en almacén (zona de devolución) debido a sobreprecios facturados por los laboratorios que exceden lo pactado en la OC.
                  </p>
                </div>

                {/* Capital Liberado */}
                <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-teal-900">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-700" />
                    <span>Capital Liberado</span>
                  </div>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    Dinero que estaba comprometido a pagar por sobreprecios y que se libera tras devolver el producto o recibir una Nota de Crédito. Al no pagarse ese sobrecosto, el dinero vuelve a estar disponible en caja para comprar otros productos.
                  </p>
                </div>

                {/* Valor Faltantes */}
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-amber-900">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-600" />
                    <span>Valor Faltantes</span>
                  </div>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    Monto en soles de unidades farmacéuticas no entregadas por los laboratorios en la recepción física, que representan riesgo de desabastecimiento comercial.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tabla detallada por laboratorio */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Desempeño Detallado por Laboratorio Proveedor</h2>
              <p className="text-xs text-slate-500">Evaluación objetiva de cumplimiento y capital retenido por proveedor</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Laboratorio Proveedor</th>
                    <th className="px-5 py-3 text-center">Confiabilidad (Cumplimiento Histórico)</th>
                    <th className="px-5 py-3 text-right">Total OCs</th>
                    <th className="px-5 py-3 text-right">OCs c/ Falla</th>
                    <th className="px-5 py-3 text-right">Incidencias</th>
                    <th className="px-5 py-3 text-right">Monto Afectado</th>
                    <th className="px-5 py-3 text-right">Monto Liberado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {labs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                        No se registraron movimientos para el período seleccionado.
                      </td>
                    </tr>
                  ) : (
                    labsPaginados.map(lab => {
                      const totalOcs = Number(lab.total_ocs || 0);
                      const ocsFallas = Number(lab.ocs_con_fallas || 0);
                      const conformes = lab.ocs_conformes !== undefined
                        ? Number(lab.ocs_conformes)
                        : Math.max(0, totalOcs - ocsFallas);
                      const confianza = lab.porcentaje_confianza !== undefined
                        ? Number(lab.porcentaje_confianza)
                        : (lab.tasa_cumplimiento_pct !== undefined
                          ? Number(lab.tasa_cumplimiento_pct)
                          : (totalOcs > 0 ? Number(((conformes / totalOcs) * 100).toFixed(1)) : 100));

                      let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      let barColor = 'bg-emerald-500';
                      if (confianza < 75) {
                        badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
                        barColor = 'bg-rose-500';
                      } else if (confianza < 90) {
                        badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                        barColor = 'bg-amber-500';
                      }

                      return (
                        <tr key={lab.laboratorio} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3 font-medium text-slate-900">{lab.laboratorio}</td>
                          <td className="px-5 py-3 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${badgeColor}`}>
                                {confianza}%
                              </span>
                              <div className="mx-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full ${barColor}`} style={{ width: `${confianza}%` }} />
                              </div>
                              <span className="mt-0.5 text-[10px] text-slate-400 tabular-nums">
                                {conformes} de {totalOcs} conformes
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-slate-700 tabular-nums">{totalOcs}</td>
                          <td className="px-5 py-3 text-right text-slate-700 tabular-nums">
                            {ocsFallas > 0 ? (
                              <span className="font-semibold text-rose-600">{ocsFallas}</span>
                            ) : (
                              <span>0</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-900 tabular-nums">{lab.incidencias}</td>
                          <td className="px-5 py-3 text-right font-medium text-rose-700 tabular-nums">
                            {formatearMoneda(lab.capital_afectado)}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                            {formatearMoneda(lab.capital_liberado)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="no-print">
              <Paginacion
                paginaActual={paginaValidaLabs}
                totalRegistros={labs.length}
                porPagina={ITEMS_POR_PAGINA}
                alCambiarPagina={setPaginaTabla}
                nombreEntidad="proveedores"
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
