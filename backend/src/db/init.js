const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./pool');
const env = require('../config/env');

async function inicializarBaseDatos() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const ddl = fs.readFileSync(schemaPath, 'utf8');

  // Eliminar comentarios y ejecutar sentencias separadas para asegurar compatibilidad entre pg y pg-mem
  const cleanDdl = ddl
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleanDdl
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await db.query(stmt);
  }

  // Asegurar configuración única id = 1
  const { rows: cfgRows } = await db.query('SELECT id FROM configuracion_sistema WHERE id = 1');
  if (cfgRows.length === 0) {
    await db.query(
      `INSERT INTO configuracion_sistema (
         id, erp_base_url, erp_api_key, sync_interval_minutos,
         tolerancia_precio_pct, tolerancia_dias_retraso,
         margen_rentabilidad_pct, costo_hora_operativa, horas_manuales_semana, despachos_mensuales_base
       ) VALUES ($1, $2, $3, 5, 0.00, 0, 20.00, 6.25, 8.00, 400)`,
      [1, env.erpBaseUrl, env.erpApiKey]
    );
  }

  // Sembrar cuentas iniciales únicamente cuando la tabla está vacía
  const { rows: userCount } = await db.query('SELECT COUNT(*)::int AS total FROM usuarios');
  if (userCount[0].total === 0) {
    const hashGerencia = await bcrypt.hash(env.seedGerenciaPassword, 10);
    const hashEmpleado = await bcrypt.hash(env.seedEmpleadoPassword, 10);

    await db.query(
      `INSERT INTO usuarios (nombre_completo, email, password_hash, cargo, rol, activo)
       VALUES ($1, $2, $3, $4, 'GERENCIA', true)`,
      ['Eber Díaz — Gerencia General', env.seedGerenciaEmail, hashGerencia, 'Gerente General']
    );

    await db.query(
      `INSERT INTO usuarios (nombre_completo, email, password_hash, cargo, rol, activo)
       VALUES ($1, $2, $3, $4, 'EMPLEADO', true)`,
      ['Operador Logística Surquillo', env.seedEmpleadoEmail, hashEmpleado, 'Analista de Operaciones y Almacén']
    );
  }
}

module.exports = {
  inicializarBaseDatos
};
