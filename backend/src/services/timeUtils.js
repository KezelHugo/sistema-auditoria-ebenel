const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Obtiene el inicio y fin del mes actual (o de una fecha dada) proyectado en zona horaria America/Lima (UTC-5),
 * retornando objetos Date en UTC equivalentes para filtrar columnas TIMESTAMP almacenadas en UTC.
 */
function getRangoMesLimaUTC(fechaReferencia = new Date()) {
  const limaMillis = fechaReferencia.getTime() - LIMA_OFFSET_MS;
  const limaDate = new Date(limaMillis);
  const year = limaDate.getUTCFullYear();
  const month = limaDate.getUTCMonth();

  const inicioMesUTC = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) + LIMA_OFFSET_MS);
  const finMesUTC = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0) + LIMA_OFFSET_MS);

  return {
    year,
    month: month + 1,
    inicioMesUTC,
    finMesUTC,
    etiquetaMes: `${year}-${String(month + 1).padStart(2, '0')}`
  };
}

function formatearFechaLima(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

module.exports = {
  LIMA_OFFSET_MS,
  getRangoMesLimaUTC,
  formatearFechaLima
};
