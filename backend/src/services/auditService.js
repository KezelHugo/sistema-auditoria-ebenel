const db = require('../db/pool');

/**
 * Registra una acción inmutable en auditoria_sistema.
 * Acepta opcionalmente un client transaccional para participar en la misma transacción.
 */
async function registrarAuditoria({
  client = null,
  usuario = null,
  accion,
  entidad = null,
  entidadId = null,
  descripcion,
  detalleAnterior = null,
  detalleNuevo = null,
  ipOrigen = null
}) {
  const runner = client || db;
  await runner.query(
    `INSERT INTO auditoria_sistema (
       usuario_id, usuario_nombre, usuario_email, rol,
       accion, entidad, entidad_id, descripcion,
       detalle_anterior, detalle_nuevo, ip_origen
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      usuario ? usuario.id : null,
      usuario ? usuario.nombre_completo : 'Sistema Automático',
      usuario ? usuario.email : null,
      usuario ? usuario.rol : 'SISTEMA',
      accion,
      entidad,
      entidadId !== null && entidadId !== undefined ? String(entidadId) : null,
      descripcion,
      detalleAnterior ? JSON.stringify(detalleAnterior) : null,
      detalleNuevo ? JSON.stringify(detalleNuevo) : null,
      ipOrigen
    ]
  );
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'desconocida';
}

module.exports = {
  registrarAuditoria,
  getClientIp
};
