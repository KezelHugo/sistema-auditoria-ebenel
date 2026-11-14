const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const { autenticarJWT } = require('../middleware/auth');
const { requerirRol } = require('../middleware/rbac');
const { registrarAuditoria, getClientIp } = require('../services/auditService');
const { ejecutarSincronizacion, obtenerConfigSistema } = require('../services/syncService');
const { ErpClient, fetchJsonConReintento } = require('../services/erpClient');

const router = express.Router();

// Todo el módulo administrativo es exclusivo de GERENCIA
router.use(autenticarJWT, requerirRol('GERENCIA'));

const ROLES_VALIDOS = ['GERENCIA', 'EMPLEADO'];

function sanitizarUsuario(u) {
  return {
    id: u.id,
    nombre_completo: u.nombre_completo,
    email: u.email,
    cargo: u.cargo,
    rol: u.rol,
    activo: Boolean(u.activo),
    token_version: u.token_version,
    ultimo_acceso: u.ultimo_acceso,
    created_at: u.created_at,
    updated_at: u.updated_at
  };
}

function sanitizarConfig(cfg) {
  const tieneKey = Boolean(cfg.erp_api_key && String(cfg.erp_api_key).trim().length > 0);
  const keyStr = tieneKey ? String(cfg.erp_api_key) : '';
  const masked = tieneKey
    ? (keyStr.length > 6 ? `${keyStr.slice(0, 2)}${'*'.repeat(Math.min(keyStr.length - 4, 10))}${keyStr.slice(-2)}` : '******')
    : '';

  return {
    id: cfg.id,
    erp_base_url: cfg.erp_base_url,
    tiene_erp_api_key: tieneKey,
    erp_api_key_masked: masked,
    sync_interval_minutos: Number(cfg.sync_interval_minutos),
    tolerancia_precio_pct: Number(cfg.tolerancia_precio_pct),
    tolerancia_dias_retraso: Number(cfg.tolerancia_dias_retraso),
    margen_rentabilidad_pct: Number(cfg.margen_rentabilidad_pct),
    costo_hora_operativa: Number(cfg.costo_hora_operativa),
    horas_manuales_semana: Number(cfg.horas_manuales_semana),
    despachos_mensuales_base: Number(cfg.despachos_mensuales_base),
    erp_ultimo_checkpoint_at: cfg.erp_ultimo_checkpoint_at,
    erp_last_reset_at: cfg.erp_last_reset_at,
    ultima_sync_exitosa_at: cfg.ultima_sync_exitosa_at,
    ultima_verificacion_erp_at: cfg.ultima_verificacion_erp_at,
    erp_api_online: Boolean(cfg.erp_api_online),
    erp_modo_simulacion: cfg.erp_modo_simulacion,
    updated_at: cfg.updated_at
  };
}

async function contarGerentesActivos(runner = db, excluirId = null) {
  const { rows } = await runner.query(
    "SELECT id FROM usuarios WHERE rol = 'GERENCIA' AND activo = true"
  );
  return rows.filter(r => r.id !== excluirId).length;
}

// -----------------------------------------------------------------------------
// GESTIÓN DE TRABAJADORES
// -----------------------------------------------------------------------------
router.get('/usuarios', async (req, res, next) => {
  try {
    const { rol, activo, q } = req.query;
    const { rows } = await db.query(
      `SELECT id, nombre_completo, email, cargo, rol, activo, token_version, ultimo_acceso, created_at, updated_at
       FROM usuarios
       ORDER BY id ASC`
    );

    let lista = rows.map(sanitizarUsuario);
    if (rol && rol !== 'TODOS') {
      lista = lista.filter(u => u.rol === rol);
    }
    if (activo !== undefined && activo !== 'TODOS') {
      const flag = activo === 'true' || activo === '1';
      lista = lista.filter(u => u.activo === flag);
    }
    if (q) {
      const qLower = String(q).toLowerCase();
      lista = lista.filter(u =>
        u.nombre_completo.toLowerCase().includes(qLower) ||
        u.email.toLowerCase().includes(qLower) ||
        String(u.cargo || '').toLowerCase().includes(qLower)
      );
    }

    res.json({
      total: lista.length,
      resumen: {
        total: rows.length,
        activos: rows.filter(u => u.activo).length,
        revocados: rows.filter(u => !u.activo).length,
        gerencia: rows.filter(u => u.rol === 'GERENCIA').length,
        empleado: rows.filter(u => u.rol === 'EMPLEADO').length
      },
      data: lista
    });
  } catch (err) {
    next(err);
  }
});

router.post('/usuarios', async (req, res, next) => {
  try {
    const nombreCompleto = String(req.body?.nombre_completo || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const cargo = String(req.body?.cargo || 'Operador Logístico').trim() || 'Operador Logístico';
    const rol = String(req.body?.rol || 'EMPLEADO').trim().toUpperCase();

    if (nombreCompleto.length < 3) {
      return res.status(400).json({ error: 'El nombre completo debe tener al menos 3 caracteres.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido. Usa GERENCIA o EMPLEADO.' });
    }

    const { rows: existentes } = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existentes.length > 0) {
      return res.status(409).json({ error: 'Ya existe un trabajador registrado con ese correo.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows: createdRows } = await db.query(
      `INSERT INTO usuarios (nombre_completo, email, password_hash, cargo, rol, activo, token_version, created_by)
       VALUES ($1, $2, $3, $4, $5, true, 1, $6)
       RETURNING id, nombre_completo, email, cargo, rol, activo, token_version, ultimo_acceso, created_at, updated_at`,
      [nombreCompleto, email, passwordHash, cargo, rol, req.usuario.id]
    );

    const nuevo = sanitizarUsuario(createdRows[0]);
    await registrarAuditoria({
      usuario: req.usuario,
      accion: 'CREAR_TRABAJADOR',
      entidad: 'usuarios',
      entidadId: nuevo.id,
      descripcion: `Alta de trabajador: ${nuevo.nombre_completo} (${nuevo.email}) con rol ${nuevo.rol}.`,
      detalleNuevo: nuevo,
      ipOrigen: getClientIp(req)
    });

    res.status(201).json({ usuario: nuevo });
  } catch (err) {
    next(err);
  }
});

router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de trabajador inválido.' });
    }

    const { rows } = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Trabajador no encontrado.' });
    }
    const actual = rows[0];

    const nombreCompleto = req.body?.nombre_completo !== undefined
      ? String(req.body.nombre_completo).trim()
      : actual.nombre_completo;
    const email = req.body?.email !== undefined
      ? String(req.body.email).trim().toLowerCase()
      : actual.email;
    const cargo = req.body?.cargo !== undefined
      ? (String(req.body.cargo).trim() || 'Operador Logístico')
      : actual.cargo;
    const rol = req.body?.rol !== undefined
      ? String(req.body.rol).trim().toUpperCase()
      : actual.rol;
    const nuevaPassword = req.body?.password !== undefined && String(req.body.password) !== ''
      ? String(req.body.password)
      : null;

    if (nombreCompleto.length < 3) {
      return res.status(400).json({ error: 'El nombre completo debe tener al menos 3 caracteres.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Correo electrónico inválido.' });
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido. Usa GERENCIA o EMPLEADO.' });
    }
    if (nuevaPassword && nuevaPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    if (email !== actual.email) {
      const { rows: dup } = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
      if (dup.length > 0 && dup[0].id !== id) {
        return res.status(409).json({ error: 'El correo indicado ya pertenece a otro trabajador.' });
      }
    }

    if (actual.rol === 'GERENCIA' && rol !== 'GERENCIA') {
      if (id === req.usuario.id) {
        return res.status(400).json({ error: 'No puedes cambiar tu propio rol de Gerencia.' });
      }
      const otrosGerentes = await contarGerentesActivos(db, id);
      if (otrosGerentes === 0) {
        return res.status(400).json({ error: 'Debe permanecer al menos una cuenta activa de GERENCIA.' });
      }
    }

    const passwordHash = nuevaPassword ? await bcrypt.hash(nuevaPassword, 10) : actual.password_hash;
    const incrementarVersion = rol !== actual.rol || Boolean(nuevaPassword);
    const nextVersion = incrementarVersion ? Number(actual.token_version || 1) + 1 : Number(actual.token_version || 1);

    const { rows: updatedRows } = await db.query(
      `UPDATE usuarios
       SET nombre_completo = $2,
           email = $3,
           password_hash = $4,
           cargo = $5,
           rol = $6,
           token_version = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, nombre_completo, email, cargo, rol, activo, token_version, ultimo_acceso, created_at, updated_at`,
      [id, nombreCompleto, email, passwordHash, cargo, rol, nextVersion]
    );

    const actualizado = sanitizarUsuario(updatedRows[0]);
    await registrarAuditoria({
      usuario: req.usuario,
      accion: 'EDITAR_TRABAJADOR',
      entidad: 'usuarios',
      entidadId: id,
      descripcion: `Edición de trabajador ${actualizado.nombre_completo} (${actualizado.email}).${nuevaPassword ? ' Contraseña restablecida.' : ''}`,
      detalleAnterior: sanitizarUsuario(actual),
      detalleNuevo: actualizado,
      ipOrigen: getClientIp(req)
    });

    res.json({ usuario: actualizado });
  } catch (err) {
    next(err);
  }
});

router.patch('/usuarios/:id/acceso', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de trabajador inválido.' });
    }
    if (typeof req.body?.activo !== 'boolean') {
      return res.status(400).json({ error: 'Debes indicar activo: true o false.' });
    }

    const { rows } = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Trabajador no encontrado.' });
    }
    const actual = rows[0];
    const nuevoActivo = req.body.activo;

    if (!nuevoActivo && id === req.usuario.id) {
      return res.status(400).json({ error: 'No puedes revocar tu propio acceso.' });
    }
    if (!nuevoActivo && actual.rol === 'GERENCIA') {
      const otrosGerentes = await contarGerentesActivos(db, id);
      if (otrosGerentes === 0) {
        return res.status(400).json({ error: 'Debe permanecer al menos una cuenta activa de GERENCIA.' });
      }
    }

    const nextVersion = Number(actual.token_version || 1) + 1;
    const { rows: updatedRows } = await db.query(
      `UPDATE usuarios
       SET activo = $2,
           token_version = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, nombre_completo, email, cargo, rol, activo, token_version, ultimo_acceso, created_at, updated_at`,
      [id, nuevoActivo, nextVersion]
    );

    const actualizado = sanitizarUsuario(updatedRows[0]);
    const accion = nuevoActivo ? 'RESTAURAR_ACCESO_TRABAJADOR' : 'REVOCAR_ACCESO_TRABAJADOR';
    await registrarAuditoria({
      usuario: req.usuario,
      accion,
      entidad: 'usuarios',
      entidadId: id,
      descripcion: nuevoActivo
        ? `Acceso restaurado para ${actualizado.nombre_completo} (${actualizado.email}).`
        : `Acceso revocado de inmediato para ${actualizado.nombre_completo} (${actualizado.email}).`,
      detalleAnterior: { activo: Boolean(actual.activo), token_version: actual.token_version },
      detalleNuevo: { activo: actualizado.activo, token_version: actualizado.token_version },
      ipOrigen: getClientIp(req)
    });

    res.json({ usuario: actualizado });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// CONFIGURACIÓN DEL SISTEMA & TOLERANCIAS
// -----------------------------------------------------------------------------
router.get('/config', async (req, res, next) => {
  try {
    const cfg = await obtenerConfigSistema();
    res.json({ config: sanitizarConfig(cfg) });
  } catch (err) {
    next(err);
  }
});

router.put('/config', async (req, res, next) => {
  try {
    const actual = await obtenerConfigSistema();

    let erpBaseUrl = req.body?.erp_base_url !== undefined
      ? String(req.body.erp_base_url).trim().replace(/\/+$/, '')
      : actual.erp_base_url;

    try {
      const parsed = new URL(erpBaseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Protocolo no válido');
      }
    } catch (_) {
      return res.status(400).json({ error: 'La URL base del ERP debe ser una URL http/https válida.' });
    }

    let erpApiKey = actual.erp_api_key || '';
    if (req.body?.limpiar_api_key === true) {
      erpApiKey = '';
    } else if (req.body?.erp_api_key !== undefined && String(req.body.erp_api_key).trim() !== '') {
      erpApiKey = String(req.body.erp_api_key).trim();
    }

    const syncInterval = req.body?.sync_interval_minutos !== undefined
      ? Number(req.body.sync_interval_minutos)
      : Number(actual.sync_interval_minutos);
    const tolPrecio = req.body?.tolerancia_precio_pct !== undefined
      ? Number(req.body.tolerancia_precio_pct)
      : Number(actual.tolerancia_precio_pct);
    const tolDias = req.body?.tolerancia_dias_retraso !== undefined
      ? Number(req.body.tolerancia_dias_retraso)
      : (actual.tolerancia_dias_retraso !== undefined ? Number(actual.tolerancia_dias_retraso) : 0);
    const margenPct = req.body?.margen_rentabilidad_pct !== undefined
      ? Number(req.body.margen_rentabilidad_pct)
      : (actual.margen_rentabilidad_pct !== undefined ? Number(actual.margen_rentabilidad_pct) : 20);
    const costoHora = req.body?.costo_hora_operativa !== undefined
      ? Number(req.body.costo_hora_operativa)
      : Number(actual.costo_hora_operativa);
    const horasSemana = req.body?.horas_manuales_semana !== undefined
      ? Number(req.body.horas_manuales_semana)
      : Number(actual.horas_manuales_semana);
    const despachosBase = req.body?.despachos_mensuales_base !== undefined
      ? Number(req.body.despachos_mensuales_base)
      : Number(actual.despachos_mensuales_base);

    if (!Number.isInteger(syncInterval) || syncInterval < 1 || syncInterval > 60) {
      return res.status(400).json({ error: 'sync_interval_minutos debe ser entero entre 1 y 60.' });
    }
    if (req.body?.tolerancia_precio_pct !== undefined && (!Number.isFinite(tolPrecio) || tolPrecio < 0 || tolPrecio > 50)) {
      return res.status(400).json({ error: 'tolerancia_precio_pct debe estar entre 0 y 50.' });
    }
    if (req.body?.tolerancia_dias_retraso !== undefined && (!Number.isInteger(tolDias) || tolDias < 0 || tolDias > 30)) {
      return res.status(400).json({ error: 'tolerancia_dias_retraso debe ser entero entre 0 y 30.' });
    }
    if (req.body?.margen_rentabilidad_pct !== undefined && (!Number.isFinite(margenPct) || margenPct <= 0 || margenPct > 90)) {
      return res.status(400).json({ error: 'margen_rentabilidad_pct debe estar entre 0.1 y 90.' });
    }
    if (!Number.isFinite(costoHora) || costoHora < 0 || costoHora > 1000) {
      return res.status(400).json({ error: 'costo_hora_operativa debe estar entre 0 y 1000.' });
    }
    if (!Number.isFinite(horasSemana) || horasSemana < 0 || horasSemana > 168) {
      return res.status(400).json({ error: 'horas_manuales_semana debe estar entre 0 y 168.' });
    }
    if (!Number.isInteger(despachosBase) || despachosBase < 1 || despachosBase > 50000) {
      return res.status(400).json({ error: 'despachos_mensuales_base debe ser entero positivo.' });
    }

    const { rows } = await db.query(
      `UPDATE configuracion_sistema
       SET erp_base_url = $1,
           erp_api_key = $2,
           sync_interval_minutos = $3,
           tolerancia_precio_pct = $4,
           tolerancia_dias_retraso = $5,
           margen_rentabilidad_pct = $6,
           costo_hora_operativa = $7,
           horas_manuales_semana = $8,
           despachos_mensuales_base = $9,
           updated_by = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      [
        erpBaseUrl,
        erpApiKey,
        syncInterval,
        tolPrecio,
        tolDias,
        margenPct,
        costoHora,
        horasSemana,
        despachosBase,
        req.usuario.id
      ]
    );

    const actualizada = sanitizarConfig(rows[0]);
    await registrarAuditoria({
      usuario: req.usuario,
      accion: 'ACTUALIZAR_CONFIGURACION',
      entidad: 'configuracion_sistema',
      entidadId: 1,
      descripcion: `Configuración del sistema actualizada por ${req.usuario.nombre_completo}.`,
      detalleAnterior: sanitizarConfig(actual),
      detalleNuevo: actualizada,
      ipOrigen: getClientIp(req)
    });

    res.json({ config: actualizada });
  } catch (err) {
    next(err);
  }
});

router.post('/test-erp', async (req, res) => {
  const actual = await obtenerConfigSistema();
  const url = String(req.body?.erp_base_url || actual.erp_base_url).trim().replace(/\/+$/, '');
  const apiKey = req.body?.erp_api_key && String(req.body.erp_api_key).trim() !== ''
    ? String(req.body.erp_api_key).trim()
    : (actual.erp_api_key || '');

  const inicio = Date.now();
  try {
    const erp = new ErpClient(url, apiKey);
    const health = await fetchJsonConReintento(`${erp.baseUrl}/health`, {
      apiKey,
      timeoutMs: 12000,
      reintentos: 0
    });
    const probe = await fetchJsonConReintento(
      `${erp.baseUrl}/api/v1/erp/ordenes-compra?limit=1&offset=0`,
      { apiKey, timeoutMs: 12000, reintentos: 0 }
    );
    res.json({
      conectado: true,
      latencia_ms: Date.now() - inicio,
      modo_actual: health.modo_actual || 'DESCONOCIDO',
      api_key_requerida: Boolean(health.api_key_requerida),
      ocs_en_erp: probe.total ?? null,
      health
    });
  } catch (err) {
    res.status(502).json({
      conectado: false,
      latencia_ms: Date.now() - inicio,
      error: err.message
    });
  }
});

// -----------------------------------------------------------------------------
// AUDITORÍA DEL SISTEMA & LOGS DE SINCRONIZACIÓN
// -----------------------------------------------------------------------------
router.get('/auditoria', async (req, res, next) => {
  try {
    const { accion, rol, entidad, q, desde, hasta } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows } = await db.query(
      'SELECT * FROM auditoria_sistema ORDER BY created_at DESC, id DESC'
    );

    const accionesDisponibles = Array.from(new Set(rows.map(r => r.accion).filter(Boolean))).sort();

    let filtradas = rows;
    if (accion && accion !== 'TODAS') {
      filtradas = filtradas.filter(r => r.accion === accion);
    }
    if (rol && rol !== 'TODOS') {
      filtradas = filtradas.filter(r => r.rol === rol);
    }
    if (entidad && entidad !== 'TODAS') {
      filtradas = filtradas.filter(r => r.entidad === entidad);
    }
    if (desde) {
      const dMs = Date.parse(desde);
      if (!Number.isNaN(dMs)) {
        filtradas = filtradas.filter(r => Date.parse(r.created_at) >= dMs);
      }
    }
    if (hasta) {
      const hMs = Date.parse(hasta);
      if (!Number.isNaN(hMs)) {
        filtradas = filtradas.filter(r => Date.parse(r.created_at) <= hMs);
      }
    }
    if (q) {
      const qLower = String(q).toLowerCase();
      filtradas = filtradas.filter(r =>
        String(r.usuario_nombre || '').toLowerCase().includes(qLower) ||
        String(r.usuario_email || '').toLowerCase().includes(qLower) ||
        String(r.descripcion || '').toLowerCase().includes(qLower) ||
        String(r.entidad_id || '').toLowerCase().includes(qLower) ||
        String(r.accion || '').toLowerCase().includes(qLower)
      );
    }

    res.json({
      total: filtradas.length,
      limit,
      offset,
      acciones_disponibles: accionesDisponibles,
      data: filtradas.slice(offset, offset + limit)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/sync-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows: countRows } = await db.query('SELECT COUNT(*)::int AS total FROM sync_logs');
    const total = countRows[0]?.total || 0;

    const { rows } = await db.query(
      'SELECT * FROM sync_logs ORDER BY ejecutado_en DESC, id DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json({ total, data: rows, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    const forzarBootstrap = Boolean(req.body?.forzar_bootstrap);
    const resultado = await ejecutarSincronizacion({
      tipo: 'MANUAL_ADMIN',
      usuario: req.usuario,
      ipOrigen: getClientIp(req),
      forzarBootstrap
    });

    if (resultado.omitido) {
      return res.status(409).json(resultado);
    }

    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
