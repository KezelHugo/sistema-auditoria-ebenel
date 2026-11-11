const express = require('express');
const db = require('../db/pool');
const { autenticarJWT } = require('../middleware/auth');
const { verificarEstadoErpEnVivo } = require('../services/syncService');

const router = express.Router();

// Endpoint público para monitoreo PaaS (Render / cron-job.org / UptimeRobot)
router.get('/health', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    await db.query('SELECT 1');
    const { rows } = await db.query(
      'SELECT erp_api_online, erp_modo_simulacion, ultima_sync_exitosa_at FROM configuracion_sistema WHERE id = 1'
    );
    const cfg = rows[0] || {};
    res.json({
      status: 'ONLINE',
      servicio: 'Sistema Web Externo de Auditoría Logística — Droguería Ebenel',
      uptime_seconds: Math.round(process.uptime()),
      bd_conectada: true,
      erp_api_online: Boolean(cfg.erp_api_online),
      erp_modo_simulacion: cfg.erp_modo_simulacion || 'DESCONOCIDO',
      ultima_actualizacion_at: cfg.ultima_sync_exitosa_at || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'DEGRADED',
      bd_conectada: false,
      error: err.message
    });
  }
});

// Indicador superior global para usuarios autenticados (verifica estado API ERP y última actualización)
router.get('/api/status', autenticarJWT, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const forzarPing = req.query.check === '1' || req.query.check === 'true';
    const estado = await verificarEstadoErpEnVivo(forzarPing);
    res.json(estado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
