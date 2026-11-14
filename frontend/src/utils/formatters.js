export function formatearMoneda(valor) {
  const num = Number(valor || 0);
  return `S/ ${num.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatearFechaLima(fechaIso) {
  if (!fechaIso) return '—';
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

export function formatearFechaCortaLima(fechaIso) {
  if (!fechaIso) return '—';
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function formatearTiempoRelativo(fechaIso) {
  if (!fechaIso) return 'Sin sincronizar';
  const ms = Date.parse(fechaIso);
  if (Number.isNaN(ms)) return '—';
  const diffSeg = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSeg < 60) return `Hace ${diffSeg}s`;
  const min = Math.floor(diffSeg / 60);
  if (min < 60) return `Hace ${min} min`;
  const horas = Math.floor(min / 60);
  const remMin = min % 60;
  if (horas < 24) return remMin > 0 ? `Hace ${horas}h ${remMin}m` : `Hace ${horas}h`;
  const dias = Math.floor(horas / 24);
  const remHoras = horas % 24;
  return remHoras > 0 ? `Hace ${dias}d ${remHoras}h` : `Hace ${dias}d`;
}

export const TIPO_INCIDENCIA_META = {
  ENTREGA_INCOMPLETA: {
    etiqueta: 'Entrega Incompleta',
    corto: 'Faltantes',
    badge: 'bg-amber-50 text-amber-800 border-amber-200'
  },
  PRODUCTO_INMOVILIZADO_PRECIO: {
    etiqueta: 'Producto Inmovilizado (Precio)',
    corto: 'Inmovilizado',
    badge: 'bg-rose-50 text-rose-800 border-rose-200'
  },
  RETRASO_ENTREGA: {
    etiqueta: 'Retraso de Entrega',
    corto: 'Retraso',
    badge: 'bg-orange-50 text-orange-800 border-orange-200'
  }
};

export const ESTADO_GESTION_META = {
  ABIERTA: {
    etiqueta: 'Abierta',
    badge: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  EN_GESTION: {
    etiqueta: 'En Gestión',
    badge: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  PENDIENTE_RECOJO: {
    etiqueta: 'Pendiente de Recojo',
    badge: 'bg-orange-50 text-orange-700 border-orange-200'
  },
  DEVUELTO: {
    etiqueta: 'Devuelto al Proveedor',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  CERRADA_ACEPTADA: {
    etiqueta: 'Sobreprecio Aceptado',
    badge: 'bg-teal-50 text-teal-700 border-teal-200'
  },
  RESUELTA_CAPITAL_LIBERADO: {
    etiqueta: 'Resuelta / Liberada',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  CERRADA_SIN_RECUPERACION: {
    etiqueta: 'Cerrada sin Recuperación',
    badge: 'bg-slate-100 text-slate-700 border-slate-200'
  }
};

export const ESTADO_CONCILIACION_META = {
  CONFORME: {
    etiqueta: 'Conforme',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  CON_INCIDENCIAS: {
    etiqueta: 'Con Incidencias',
    badge: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  VENCIDA_SIN_ENTREGA: {
    etiqueta: 'Vencida sin Entrega',
    badge: 'bg-orange-50 text-orange-800 border-orange-200'
  },
  PENDIENTE_RECEPCION: {
    etiqueta: 'En Tránsito',
    badge: 'bg-slate-100 text-slate-700 border-slate-200'
  }
};

export const SEVERIDAD_BADGE = {
  ALTA: 'bg-rose-50 text-rose-700 border-rose-200',
  MEDIA: 'bg-amber-50 text-amber-700 border-amber-200',
  BAJA: 'bg-slate-100 text-slate-700 border-slate-200'
};

export function obtenerEstadoCompromiso(fechaIso, tipoIncidencia = null) {
  if (!fechaIso) return null;
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return null;

  const hoy = new Date();
  const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const fechaObj = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDias = Math.round((fechaObj.getTime() - fechaHoy.getTime()) / (1000 * 60 * 60 * 24));

  const esRecojo = tipoIncidencia === 'PRODUCTO_INMOVILIZADO_PRECIO';

  if (diffDias < 0) {
    const diasVencidos = Math.abs(diffDias);
    return {
      estado: 'VENCIDO',
      texto: esRecojo
        ? `Recojo demorado hace ${diasVencidos} d`
        : `Compromiso vencido hace ${diasVencidos} d`,
      dias: diffDias,
      badge: 'bg-rose-100 text-rose-800 border-rose-300 font-medium'
    };
  } else if (diffDias === 0) {
    return {
      estado: 'HOY',
      texto: esRecojo
        ? 'Recojo programado para hoy'
        : 'Compromiso vence hoy',
      dias: 0,
      badge: 'bg-amber-100 text-amber-800 border-amber-300 font-semibold animate-pulse'
    };
  } else {
    return {
      estado: 'PENDIENTE',
      texto: esRecojo
        ? `Recojo programado para ${formatearFechaCortaLima(fechaIso)} (en ${diffDias} d)`
        : `Entrega pactada para ${formatearFechaCortaLima(fechaIso)} (en ${diffDias} d)`,
      dias: diffDias,
      badge: 'bg-blue-50 text-blue-700 border-blue-200 font-medium'
    };
  }
}

