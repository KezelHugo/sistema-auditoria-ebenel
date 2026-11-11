const express = require('express');
const { autenticarJWT } = require('../middleware/auth');
const { obtenerAnalitica } = require('../services/analyticsService');
const { verificarEstadoErpEnVivo } = require('../services/syncService');

const router = express.Router();

router.get('/', autenticarJWT, async (req, res, next) => {
  try {
    const periodo = req.query.periodo || 'todo';
    const [analitica, estadoErp] = await Promise.all([
      obtenerAnalitica({ periodo }),
      verificarEstadoErpEnVivo(false)
    ]);

    res.json({
      estado_erp: estadoErp,
      ...analitica
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
