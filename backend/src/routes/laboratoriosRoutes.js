const express = require('express');
const db = require('../db/pool');
const { autenticarJWT } = require('../middleware/auth');
const { registrarAuditoria, getClientIp } = require('../services/auditService');
const { reconciliarOrdenesDeLaboratorio } = require('../services/syncService');

const router = express.Router();

/**
 * GET /api/laboratorios
 * Lista todos los laboratorios proveedores con sus plazos de entrega configurados
 * y estadísticas operativas de cumplimiento en recepciones.
 */
router.get('/', autenticarJWT, async (req, res, next) => {
  try {
    const { q } = req.query;

    const [labsRes, ocsRes, concRes, incRes] = await Promise.all([
      db.query('SELECT * FROM erp_laboratorios ORDER BY razon_social ASC'),
      db.query('SELECT id, laboratorio_id FROM erp_ordenes_compra'),
      db.query('SELECT orden_compra_id, estado_conciliacion FROM conciliaciones_oc'),
      db.query('SELECT id, orden_compra_id, tipo_incidencia FROM incidencias_logisticas')
    ]);

    const concPorOc = new Map(concRes.rows.map(c => [c.orden_compra_id, c.estado_conciliacion]));
    const retrasoPorOc = new Set(
      incRes.rows.filter(i => i.tipo_incidencia === 'RETRASO_ENTREGA').map(i => i.orden_compra_id)
    );
    const incPorOc = new Map();
    for (const inc of incRes.rows) {
      incPorOc.set(inc.orden_compra_id, (incPorOc.get(inc.orden_compra_id) || 0) + 1);
    }

    const ocsPorLab = new Map();
    for (const oc of ocsRes.rows) {
      if (!ocsPorLab.has(oc.laboratorio_id)) ocsPorLab.set(oc.laboratorio_id, []);
      ocsPorLab.get(oc.laboratorio_id).push(oc);
    }

    let data = labsRes.rows.map(lab => {
      const ocs = ocsPorLab.get(lab.id) || [];
      const totalOrdenes = ocs.length;
      let ordenesConformes = 0;
      let ordenesConRetraso = 0;
      let totalIncidencias = 0;

      for (const oc of ocs) {
        if (concPorOc.get(oc.id) === 'CONFORME') ordenesConformes++;
        if (retrasoPorOc.has(oc.id)) ordenesConRetraso++;
        totalIncidencias += incPorOc.get(oc.id) || 0;
      }

      const tasaCumplimiento = totalOrdenes > 0
        ? Number(((ordenesConformes / totalOrdenes) * 100).toFixed(1))
        : 100;

      return {
        id: lab.id,
        ruc: lab.ruc,
        razon_social: lab.razon_social,
        nombre_comercial: lab.nombre_comercial,
        direccion: lab.direccion,
        plazo_entrega_dias: Number(lab.plazo_entrega_dias || 3),
        updated_by: lab.updated_by,
        updated_by_nombre: lab.updated_by_nombre,
        updated_at: lab.updated_at,
        synced_at: lab.synced_at,
        total_ordenes: totalOrdenes,
        ordenes_conformes: ordenesConformes,
        ordenes_con_retraso: ordenesConRetraso,
        total_incidencias: totalIncidencias,
        tasa_cumplimiento_pct: tasaCumplimiento
      };
    });

    if (q && String(q).trim() !== '') {
      const qLower = String(q).toLowerCase().trim();
      data = data.filter(lab =>
        String(lab.razon_social || '').toLowerCase().includes(qLower) ||
        String(lab.nombre_comercial || '').toLowerCase().includes(qLower) ||
        String(lab.ruc || '').toLowerCase().includes(qLower)
      );
    }

    res.json({
      total: data.length,
      data
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/laboratorios/:id
 * Modifica de forma independiente el plazo de entrega acordado en días
 * para un proveedor específico y re-audita de inmediato sus órdenes de compra.
 * Accesible tanto por GERENCIA como por EMPLEADO (operadores logísticos).
 */
router.patch('/:id', autenticarJWT, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de laboratorio inválido.' });
    }

    const nuevoPlazo = parseInt(req.body?.plazo_entrega_dias, 10);
    if (!Number.isInteger(nuevoPlazo) || nuevoPlazo < 1 || nuevoPlazo > 60) {
      return res.status(400).json({ error: 'El plazo de entrega debe ser un número entero entre 1 y 60 días.' });
    }

    const { rows: labActualRows } = await db.query(
      'SELECT id, ruc, razon_social, plazo_entrega_dias FROM erp_laboratorios WHERE id = $1',
      [id]
    );

    if (labActualRows.length === 0) {
      return res.status(404).json({ error: 'Laboratorio proveedor no encontrado en el sistema.' });
    }

    const labActual = labActualRows[0];
    const plazoAnterior = Number(labActual.plazo_entrega_dias || 3);

    const { rows: updatedRows } = await db.query(
      `UPDATE erp_laboratorios
       SET plazo_entrega_dias = $1,
           updated_by = $2,
           updated_by_nombre = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [nuevoPlazo, req.usuario.id, req.usuario.nombre_completo, id]
    );

    const labActualizado = updatedRows[0];

    // Re-auditar de inmediato las órdenes de compra de este laboratorio con el nuevo plazo acordado
    const ocsReauditadas = await reconciliarOrdenesDeLaboratorio(db, id);

    await registrarAuditoria({
      usuario: req.usuario,
      accion: 'ACTUALIZAR_PLAZO_PROVEEDOR',
      entidad: 'erp_laboratorios',
      entidadId: id,
      descripcion: `${req.usuario.nombre_completo} actualizó el plazo de entrega acordado para ${labActual.razon_social} de ${plazoAnterior} a ${nuevoPlazo} día(s).`,
      detalleAnterior: { plazo_entrega_dias: plazoAnterior },
      detalleNuevo: { plazo_entrega_dias: nuevoPlazo },
      ipOrigen: getClientIp(req)
    });

    res.json({
      mensaje: `Plazo de entrega de ${labActual.razon_social} actualizado a ${nuevoPlazo} día(s). Se re-auditaron ${ocsReauditadas} orden(es) de compra.`,
      data: {
        ...labActualizado,
        plazo_entrega_dias: Number(labActualizado.plazo_entrega_dias)
      },
      ocs_reauditadas: ocsReauditadas
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
