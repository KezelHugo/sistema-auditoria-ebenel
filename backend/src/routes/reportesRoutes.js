const express = require('express');
const { autenticarJWT } = require('../middleware/auth');
const { obtenerAnalitica, generarReporteCsvIncidencias } = require('../services/analyticsService');
const { registrarAuditoria, getClientIp } = require('../services/auditService');

const router = express.Router();

router.get('/rentabilidad', autenticarJWT, async (req, res, next) => {
  try {
    const periodo = req.query.periodo || 'todo';
    const data = await obtenerAnalitica({ periodo });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/export-csv', autenticarJWT, async (req, res, next) => {
  try {
    const periodo = req.query.periodo || 'todo';
    const csv = await generarReporteCsvIncidencias({ periodo });

    await registrarAuditoria({
      usuario: req.usuario,
      accion: 'EXPORTAR_REPORTE_CSV',
      entidad: 'reportes',
      descripcion: `${req.usuario.nombre_completo} exportó el reporte CSV de incidencias y liberación de capital (periodo: ${periodo}).`,
      ipOrigen: getClientIp(req)
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_auditoria_ebenel_${periodo}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
