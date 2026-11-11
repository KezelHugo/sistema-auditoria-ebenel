const cron = require('node-cron');
const env = require('./config/env');
const { inicializarBaseDatos } = require('./db/init');
const { createApp } = require('./app');
const { ejecutarSincronizacion, verificarEstadoErpEnVivo, obtenerConfigSistema } = require('./services/syncService');

async function iniciarServidor() {
  await inicializarBaseDatos();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[EBENEL-AUDITORIA] Servidor backend escuchando en http://localhost:${env.port}`);
  });

  // Verificación inicial y primera sincronización en segundo plano para no bloquear arranque HTTP
  setImmediate(async () => {
    try {
      await verificarEstadoErpEnVivo(true);
      const resSync = await ejecutarSincronizacion({ tipo: 'STARTUP' });
      console.log('[EBENEL-AUDITORIA] Sync inicial completado:', JSON.stringify(resSync));
    } catch (err) {
      console.warn('[EBENEL-AUDITORIA] Sync inicial en modo degradado:', err.message);
    }
  });

  // Cron automático cada 5 minutos (Módulo 1: extracción incremental desde API del ERP)
  let ultimoMinutoEjecutado = -1;
  cron.schedule('*/1 * * * *', async () => {
    try {
      const cfg = await obtenerConfigSistema();
      const intervalo = Math.max(1, Number(cfg?.sync_interval_minutos || 5));
      const minutoActual = new Date().getUTCMinutes();
      if (minutoActual === ultimoMinutoEjecutado) return;
      if (minutoActual % intervalo !== 0) return;

      ultimoMinutoEjecutado = minutoActual;
      const res = await ejecutarSincronizacion({ tipo: 'AUTO_CRON' });
      console.log(`[CRON ${intervalo}m]`, JSON.stringify(res));
    } catch (err) {
      console.error('[CRON ERROR]', err.message);
    }
  });

  const apagar = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);

  return server;
}

if (require.main === module) {
  iniciarServidor().catch(err => {
    console.error('[FATAL] No se pudo iniciar el backend:', err);
    process.exit(1);
  });
}

module.exports = {
  iniciarServidor
};
