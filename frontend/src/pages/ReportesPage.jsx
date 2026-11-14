import React, { useEffect, useState, useCallback } from 'react';
import { Download, Printer, Wallet, CheckCircle2, HelpCircle } from 'lucide-react';
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
import { formatearMoneda } from '../utils/formatters';

export default function ReportesPage() {
  const [periodo, setPeriodo] = useState('todo');
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');

  const [definicionAbierta, setDefinicionAbierta] = useState({
    capital: false,
    cumplimiento: false
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

  async function descargarCsv() {
    setExportando(true);
    try {
      await api.downloadCsv(
        `/api/reportes/export-csv?periodo=${periodo}`,
        `reporte_auditoria_ebenel_${periodo}.csv`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExportando(false);
    }
  }

  const rent = data?.rentabilidad || {};
  const abast = data?.resumen_abastecimiento || {};
  const evolucion = data?.evolucion_mensual || [];
  const labs = data?.ranking_laboratorios || [];

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
          <button
            type="button"
            onClick={descargarCsv}
            disabled={exportando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>{exportando ? 'Exportando...' : 'Exportar CSV'}</span>
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
          {/* Indicadores de Rentabilidad y Abastecimiento */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  Dinero en mercadería que estuvo retenida en almacén por sobreprecios facturados y que ya fue desbloqueada e ingresada al stock disponible tras gestionarse Notas de Crédito o acuerdos con los laboratorios proveedores.
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
          </div>

          {/* Gráfico de Evolución Mensual */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-900">Evolución Mensual de Capital Inmovilizado vs. Liberado</h2>
              <p className="text-xs text-slate-500">Seguimiento en soles (PEN) por mes de emisión de Órdenes de Compra</p>
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
                    <th className="px-5 py-3 text-right">Total OCs</th>
                    <th className="px-5 py-3 text-right">OCs c/ Falla</th>
                    <th className="px-5 py-3 text-right">Incidencias</th>
                    <th className="px-5 py-3 text-right">Monto Afectado</th>
                    <th className="px-5 py-3 text-right">Monto Liberado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {labs.map(lab => (
                    <tr key={lab.laboratorio} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-medium text-slate-900">{lab.laboratorio}</td>
                      <td className="px-5 py-3 text-right text-slate-700 tabular-nums">{lab.total_ocs}</td>
                      <td className="px-5 py-3 text-right text-slate-700 tabular-nums">{lab.ocs_con_fallas}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900 tabular-nums">{lab.incidencias}</td>
                      <td className="px-5 py-3 text-right font-medium text-rose-700 tabular-nums">
                        {formatearMoneda(lab.capital_afectado)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                        {formatearMoneda(lab.capital_liberado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
