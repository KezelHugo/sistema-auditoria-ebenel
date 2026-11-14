const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const erpDataRoutes = require('./routes/erpDataRoutes');
const incidenciasRoutes = require('./routes/incidenciasRoutes');
const reportesRoutes = require('./routes/reportesRoutes');
const laboratoriosRoutes = require('./routes/laboratoriosRoutes');
const adminRoutes = require('./routes/adminRoutes');

function crearCorsMiddleware() {
  const originConfig = String(env.corsOrigin || '*').trim();
  if (originConfig === '*' || originConfig === 'true') {
    return cors({ origin: true, credentials: false });
  }

  const permitidos = originConfig
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const limpio = origin.replace(/\/+$/, '');
      if (permitidos.includes(limpio)) {
        return callback(null, true);
      }
      const err = new Error(`Origen no permitido por CORS: ${origin}`);
      err.statusCode = 403;
      return callback(err);
    },
    credentials: false
  });
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(crearCorsMiddleware());
  app.use(express.json({ limit: '1mb' }));

  // Rutas principales
  app.use('/', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/ordenes-compra', erpDataRoutes);
  app.use('/api/incidencias', incidenciasRoutes);
  app.use('/api/laboratorios', laboratoriosRoutes);
  app.use('/api/reportes', reportesRoutes);
  app.use('/api/admin', adminRoutes);

  // Cualquier ruta /api/* inexistente devuelve JSON 404
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Endpoint no encontrado: ${req.method} ${req.originalUrl}` });
  });

  // Fallback opcional si existe el build del frontend en ../frontend/dist
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/health') return next();
      return res.sendFile(path.join(frontendDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({
        servicio: 'API Sistema de Auditoría Logística — Droguería Ebenel',
        documentacion_health: '/health',
        estado: 'ONLINE'
      });
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = {
  createApp
};
