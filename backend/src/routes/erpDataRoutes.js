const express = require('express');
const db = require('../db/pool');
const { autenticarJWT } = require('../middleware/auth');

const router = express.Router();

router.get('/', autenticarJWT, async (req, res, next) => {
  try {
    const { estado_conciliacion, laboratorio, q } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const [ocRes, concRes, ingRes, incRes] = await Promise.all([
      db.query('SELECT * FROM erp_ordenes_compra ORDER BY fecha_emision DESC, id DESC'),
      db.query('SELECT * FROM conciliaciones_oc'),
      db.query('SELECT id, orden_compra_id, numero_guia_ingreso, guia_remision, factura_proveedor, fecha_recepcion_fisica, estado_recepcion_erp, total_capital_inmovilizado_erp FROM erp_ingresos_almacen'),
      db.query('SELECT orden_compra_id, tipo_incidencia, estado_gestion, valor_economico_afectado, monto_liberado FROM incidencias_logisticas')
    ]);

    const concMap = new Map(concRes.rows.map(c => [c.orden_compra_id, c]));
    const ingMap = new Map(ingRes.rows.map(i => [i.orden_compra_id, i]));
    const incPorOC = new Map();
    for (const inc of incRes.rows) {
      if (!incPorOC.has(inc.orden_compra_id)) incPorOC.set(inc.orden_compra_id, []);
      incPorOC.get(inc.orden_compra_id).push(inc);
    }

    let lista = ocRes.rows.map(oc => {
      const conc = concMap.get(oc.id) || null;
      const ing = ingMap.get(oc.id) || null;
      const incidencias = incPorOC.get(oc.id) || [];
      return {
        ...oc,
        conciliacion: conc,
        ingreso: ing,
        incidencias_resumen: incidencias
      };
    });

    if (estado_conciliacion) {
      lista = lista.filter(o => (o.conciliacion?.estado_conciliacion || 'PENDIENTE_RECEPCION') === estado_conciliacion);
    }
    if (laboratorio) {
      const labLower = String(laboratorio).toLowerCase();
      lista = lista.filter(o =>
        String(o.laboratorio_razon || '').toLowerCase().includes(labLower) ||
        String(o.laboratorio_nombre || '').toLowerCase().includes(labLower)
      );
    }
    if (q) {
      const queryLower = String(q).toLowerCase();
      lista = lista.filter(o =>
        String(o.numero_oc || '').toLowerCase().includes(queryLower) ||
        String(o.laboratorio_razon || '').toLowerCase().includes(queryLower) ||
        String(o.ingreso?.numero_guia_ingreso || '').toLowerCase().includes(queryLower)
      );
    }

    const total = lista.length;
    const paginado = lista.slice(offset, offset + limit);

    res.json({
      total,
      limit,
      offset,
      data: paginado
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', autenticarJWT, async (req, res, next) => {
  try {
    const idParam = req.params.id;
    const isNumeric = /^\d+$/.test(String(idParam));

    const { rows: ocRows } = await db.query(
      isNumeric
        ? 'SELECT * FROM erp_ordenes_compra WHERE id = $1'
        : 'SELECT * FROM erp_ordenes_compra WHERE numero_oc = $1',
      [isNumeric ? Number(idParam) : idParam]
    );

    if (ocRows.length === 0) {
      return res.status(404).json({ error: 'Orden de compra no encontrada en el espejo local.' });
    }

    const oc = ocRows[0];
    const [itemsRes, ingRes, concRes, incRes] = await Promise.all([
      db.query('SELECT * FROM erp_ordenes_compra_detalle WHERE orden_compra_id = $1 ORDER BY item_nro ASC', [oc.id]),
      db.query('SELECT * FROM erp_ingresos_almacen WHERE orden_compra_id = $1', [oc.id]),
      db.query('SELECT * FROM conciliaciones_oc WHERE orden_compra_id = $1', [oc.id]),
      db.query('SELECT * FROM incidencias_logisticas WHERE orden_compra_id = $1 ORDER BY id ASC', [oc.id])
    ]);

    let ingreso = null;
    if (ingRes.rows.length > 0) {
      const { rows: ingItems } = await db.query(
        'SELECT * FROM erp_ingresos_almacen_detalle WHERE ingreso_almacen_id = $1 ORDER BY item_nro ASC',
        [ingRes.rows[0].id]
      );
      ingreso = { ...ingRes.rows[0], items_recibidos: ingItems };
    }

    res.json({
      ...oc,
      items: itemsRes.rows,
      ingreso,
      conciliacion: concRes.rows[0] || null,
      incidencias: incRes.rows
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
