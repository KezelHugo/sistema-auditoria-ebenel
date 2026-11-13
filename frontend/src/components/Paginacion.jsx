import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Paginacion({
  paginaActual,
  totalRegistros,
  porPagina = 50,
  alCambiarPagina,
  nombreEntidad = 'registros'
}) {
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / porPagina));

  if (totalRegistros <= 0) return null;

  const desde = (paginaActual - 1) * porPagina + 1;
  const hasta = Math.min(paginaActual * porPagina, totalRegistros);

  function generarNumeros() {
    if (totalPaginas <= 7) {
      return Array.from({ length: totalPaginas }, (_, i) => i + 1);
    }
    const paginas = [];
    if (paginaActual <= 4) {
      for (let i = 1; i <= 5; i++) paginas.push(i);
      paginas.push('...');
      paginas.push(totalPaginas);
    } else if (paginaActual >= totalPaginas - 3) {
      paginas.push(1);
      paginas.push('...');
      for (let i = totalPaginas - 4; i <= totalPaginas; i++) paginas.push(i);
    } else {
      paginas.push(1);
      paginas.push('...');
      for (let i = paginaActual - 1; i <= paginaActual + 1; i++) paginas.push(i);
      paginas.push('...');
      paginas.push(totalPaginas);
    }
    return paginas;
  }

  const numeros = generarNumeros();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
      <div>
        Mostrando <span className="font-semibold text-slate-900">{desde}</span> a{' '}
        <span className="font-semibold text-slate-900">{hasta}</span> de{' '}
        <span className="font-semibold text-slate-900">{totalRegistros}</span> {nombreEntidad}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={paginaActual <= 1}
          onClick={() => alCambiarPagina(Math.max(1, paginaActual - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Anterior</span>
        </button>

        <div className="flex items-center gap-1">
          {numeros.map((item, idx) =>
            item === '...' ? (
              <span key={`dots-${idx}`} className="px-1 text-slate-400">
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => alCambiarPagina(item)}
                className={`h-7 min-w-[28px] rounded-md px-2 text-xs font-medium tabular-nums transition ${
                  paginaActual === item
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          disabled={paginaActual >= totalPaginas}
          onClick={() => alCambiarPagina(Math.min(totalPaginas, paginaActual + 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>Siguiente</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
