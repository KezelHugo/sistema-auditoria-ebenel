const express = require('express');
const db = require('../db/pool');
const { autenticarJWT } = require('../middleware/auth');
const { registrarAuditoria, getClientIp } = require('../services/auditService');

const router = express.Router();

const ESTADOS_GESTION_VALIDOS = [
  'ABIERTA',
  'EN_GESTION',
  'RESUELTA_CAPITAL_LIBERADO',
  'CERRADA_SIN_RECUPERACION'
];

router.get('/', autenticarJWT, async (req, res, next) => {
  try {
    const { tipo, estado, severidad, q } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows } = await db.query(
      'SELECT * FROM incidencias_logisticas ORDER BY detectada_en DESC, id DESC'
    );

    let filtradas = rows;
    if (tipo && tipo !== 'TODAS') {
      filtradas = filtradas.filter(i => i.tipo_incidencia === tipo);
    }
    if (estado && estado !== 'TODOS') {
      if (estado === 'ACTIVAS') {
        filtradas = filtradas.filter(i => i.estado_gestion === 'ABIERTA' || i.estado_gestion === 'EN_GESTION');
      } else {
        filtradas = filtradas.filter(i => i.estado_gestion === estado);
      }
    }
    if (severidad && severidad !== 'TODAS') {
      filtradas = filtradas.filter(i => i.severidad === severidad);
    }
    if (q) {
      const qLower = String(q).toLowerCase();
      filtradas = filtradas.filter(i =>
        String(i.numero_oc || '').toLowerCase().includes(qLower) ||
        String(i.sku || '').toLowerCase().includes(qLower) ||
        String(i.nombre_producto || '').toLowerCase().includes(qLower) ||
        String(i.laboratorio_nombre || '').toLowerCase().includes(qLower)
      );
    }

    const resumenTipos = {
      total: rows.length,
      activas: rows.filter(i => i.estado_gestion === 'ABIERTA' || i.estado_gestion === 'EN_GESTION').length,
      ENTREGA_INCOMPLETA: rows.filter(i => i.tipo_incidencia === 'ENTREGA_INCOMPLETA').length,
      PRODUCTO_INMOVILIZADO_PRECIO: rows.filter(i => i.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO').length,
      RETRASO_ENTREGA: rows.filter(i => i.tipo_incidencia === 'RETRASO_ENTREGA').length
    };

    res.json({
      total: filtradas.length,
      limit,
      offset,
      resumen_tipos: resumenTipos,
      data: filtradas.slice(offset, offset + limit)
    });
  } catch (err) {
    next(err);
  }
});

// Tanto GERENCIA como EMPLEADO pueden cambiar estado, registrar Nota de Crédito y liberar capital
router.patch('/:id', autenticarJWT, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de incidencia inválido.' });
    }

    const { rows } = await db.query('SELECT * FROM incidencias_logisticas WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Incidencia logística no encontrada.' });
    }
    const actual = rows[0];

    const estadoNuevo = req.body?.estado_gestion || actual.estado_gestion;
    if (!ESTADOS_GESTION_VALIDOS.includes(estadoNuevo)) {
      return res.status(400).json({
        error: `Estado de gestión inválido. Valores permitidos: ${ESTADOS_GESTION_VALIDOS.join(', ')}`
      });
    }

    let cantidadRegularizada = req.body?.cantidad_regularizada !== undefined
      ? Math.max(0, parseInt(req.body.cantidad_regularizada, 10) || 0)
      : Number(actual.cantidad_regularizada || 0);

    let montoRaw = req.body?.monto_liberado !== undefined
      ? Number(req.body.monto_liberado)
      : Number(actual.monto_liberado || 0);

    // Si no se proporcionó monto_liberado explícito, calcularlo automáticamente a partir de las unidades regularizadas
    if (req.body?.monto_liberado === undefined && req.body?.cantidad_regularizada !== undefined) {
      if (actual.tipo_incidencia === 'ENTREGA_INCOMPLETA') {
        const precioUnit = Number(actual.precio_pactado || 0);
        montoRaw = Number((cantidadRegularizada * precioUnit).toFixed(2));
      } else if (actual.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO') {
        const precioUnit = Number(actual.precio_facturado || actual.precio_pactado || 0);
        montoRaw = Number((cantidadRegularizada * precioUnit).toFixed(2));
      }
    }

    if (Number.isNaN(montoRaw) || montoRaw < 0) {
      return res.status(400).json({ error: 'El monto liberado debe ser un número mayor o igual a cero.' });
    }

    const documentoRespaldo = req.body?.documento_respaldo !== undefined
      ? String(req.body.documento_respaldo || '').trim()
      : actual.documento_respaldo;
    const observacionesGestion = req.body?.observaciones_gestion !== undefined
      ? String(req.body.observaciones_gestion || '').trim()
      : actual.observaciones_gestion;

    // Manejo de fecha de compromiso de entrega y recordatorio variable
    let fechaCompromiso = actual.fecha_compromiso_entrega;
    if (req.body?.fecha_compromiso_entrega !== undefined) {
      if (req.body.fecha_compromiso_entrega === null || req.body.fecha_compromiso_entrega === '') {
        fechaCompromiso = null;
      } else {
        const d = new Date(req.body.fecha_compromiso_entrega);
        if (!Number.isNaN(d.getTime())) {
          fechaCompromiso = d;
        }
      }
    }

    const recordatorioNota = req.body?.recordatorio_nota !== undefined
      ? String(req.body.recordatorio_nota || '').trim()
      : actual.recordatorio_nota;

    const esResuelta = estadoNuevo === 'RESUELTA_CAPITAL_LIBERADO' || estadoNuevo === 'CERRADA_SIN_RECUPERACION';
    const resueltaEn = esResuelta ? (actual.resuelta_en || new Date()) : null;

    if (estadoNuevo === 'RESUELTA_CAPITAL_LIBERADO' && actual.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO' && montoRaw <= 0) {
      if (cantidadRegularizada > 0) {
        montoRaw = Number((cantidadRegularizada * Number(actual.precio_facturado || actual.precio_pactado || 0)).toFixed(2));
      } else {
        montoRaw = Number(actual.valor_economico_afectado || 0);
      }
    }

    const { rows: updatedRows } = await db.query(
      `UPDATE incidencias_logisticas
       SET estado_gestion = $2,
           monto_liberado = $3,
           documento_respaldo = $4,
           observaciones_gestion = $5,
           gestionado_por = $6,
           gestionado_por_nombre = $7,
           resuelta_en = $8,
           cantidad_regularizada = $9,
           fecha_compromiso_entrega = $10,
           recordatorio_nota = $11,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        id,
        estadoNuevo,
        Number(montoRaw.toFixed(2)),
        documentoRespaldo || null,
        observacionesGestion || null,
        req.usuario.id,
        req.usuario.nombre_completo,
        resueltaEn,
        cantidadRegularizada,
        fechaCompromiso,
        recordatorioNota || null
      ]
    );
    const actualizada = updatedRows[0];

    const accionAudit = montoRaw > Number(actual.monto_liberado || 0)
      ? 'LIBERAR_CAPITAL_INCIDENCIA'
      : 'CAMBIAR_ESTADO_INCIDENCIA';

    await registrarAuditoria({
      usuario: req.usuario,
      accion: accionAudit,
      entidad: 'incidencias_logisticas',
      entidadId: id,
      descripcion: `${req.usuario.nombre_completo} actualizó incidencia #${id} (${actual.numero_oc}) de ${actual.estado_gestion} a ${estadoNuevo}${montoRaw > 0 ? ` — Capital liberado: S/ ${montoRaw.toFixed(2)}` : ''}.`,
      detalleAnterior: {
        estado_gestion: actual.estado_gestion,
        monto_liberado: Number(actual.monto_liberado || 0),
        documento_respaldo: actual.documento_respaldo
      },
      detalleNuevo: {
        estado_gestion: actualizada.estado_gestion,
        monto_liberado: Number(actualizada.monto_liberado || 0),
        documento_respaldo: actualizada.documento_respaldo,
        observaciones_gestion: actualizada.observaciones_gestion
      },
      ipOrigen: getClientIp(req)
    });

    res.json({
      mensaje: 'Incidencia actualizada y registrada en auditoría.',
      data: actualizada
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
