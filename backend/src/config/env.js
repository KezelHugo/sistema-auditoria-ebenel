require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  jwtSecret: (process.env.JWT_SECRET || 'ebenel-auditoria-jwt-secret-desarrollo-2026').trim(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  erpBaseUrl: (process.env.ERP_API_BASE_URL || 'https://simulador-erp-ebenel.onrender.com').replace(/\/+$/, ''),
  erpApiKey: (process.env.ERP_API_KEY || '').trim(),
  corsOrigin: (process.env.CORS_ORIGIN || '*').trim(),
  seedGerenciaEmail: (process.env.SEED_GERENCIA_EMAIL || 'gerencia@ebenel.com.pe').trim().toLowerCase(),
  seedGerenciaPassword: process.env.SEED_GERENCIA_PASSWORD || 'admin123',
  seedEmpleadoEmail: (process.env.SEED_EMPLEADO_EMAIL || 'logistica@ebenel.com.pe').trim().toLowerCase(),
  seedEmpleadoPassword: process.env.SEED_EMPLEADO_PASSWORD || 'logistica123'
};
