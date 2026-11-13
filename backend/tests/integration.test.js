const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { newDb } = require('pg-mem');

// Variables de entorno seguras para entorno aislado de pruebas
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'test_jwt_secret_ebenel_2026';
process.env.ERP_API_KEY = 'test-erp-key-2026';

const { setTestPool } = require('../src/db/pool');
const { inicializarBaseDatos } = require('../src/db/init');
const { createApp } = require('../src/app');
const { ejecutarSincronizacion } = require('../src/services/syncService');
const db = require('../src/db/pool');

function crearMockErpServer(estadoRef) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const apiKey = req.headers['x-api-key'];

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'ONLINE',
        modo_actual: estadoRef.modo_actual,
        api_key_requerida: true,
        last_reset_at: estadoRef.last_reset_at,
        timestamp: new Date().toISOString()
      }));
    }

    if (apiKey !== 'test-erp-key-2026') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'API Key inválida o ausente' }));
    }

    if (url.pathname === '/api/v1/erp/laboratorios') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        total: estadoRef.laboratorios.length,
        data: estadoRef.laboratorios
      }));
    }

    if (url.pathname === '/api/v1/erp/medicamentos') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        total: estadoRef.medicamentos.length,
        data: estadoRef.medicamentos
      }));
    }

    if (url.pathname === '/api/v1/erp/ordenes-compra') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        sync_timestamp: new Date().toISOString(),
        total: estadoRef.ordenes.length,
        has_more: false,
        next_offset: null,
        data: estadoRef.ordenes
      }));
    }

    if (url.pathname.startsWith('/api/v1/erp/ordenes-compra/')) {
      const idOrNum = url.pathname.split('/').pop();
      const found = estadoRef.ordenes.find(o => String(o.id) === idOrNum || o.numero_oc === idOrNum);
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Not Found' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(found));
    }

    if (url.pathname === '/api/v1/erp/ingresos-almacen') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        sync_timestamp: new Date().toISOString(),
        total: estadoRef.ingresos.length,
        has_more: false,
        next_offset: null,
        data: estadoRef.ingresos
      }));
    }

    if (url.pathname === '/api/v1/erp/sincronizar') {
      const desdeMs = Date.parse(url.searchParams.get('desde') || '') || 0;
      const ocsNuevas = estadoRef.ordenes.filter(o => Date.parse(o.updated_at) >= desdeMs);
      const ingNuevos = estadoRef.ingresos.filter(i => Date.parse(i.updated_at) >= desdeMs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        sync_timestamp: new Date().toISOString(),
        last_reset_at: estadoRef.last_reset_at,
        paginacion: {
          has_more: false
        },
        ordenes_compra: ocsNuevas,
        ingresos_almacen: ingNuevos
      }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not Found' }));
  });
}

async function apiFetch(baseUrl, path, { method = 'GET', token = null, body = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, data };
}

test('Flujo completo: Bootstrap ERP, Conciliación, RBAC, Gestión Empleado, Revocación, Offline y Reset', async (t) => {
  const mem = newDb();
  const pgAdapter = mem.adapters.createPg();
  const pool = new pgAdapter.Pool();
  setTestPool(pool);

  const estadoErp = {
    modo_actual: 'ACELERADO',
    last_reset_at: '2026-11-11T10:00:00.000Z',
    laboratorios: [
      { id: 1, ruc: '20100018625', razon_social: 'Farmindustria S.A.', nombre_comercial: 'Farmindustria', direccion: 'Lima' }
    ],
    medicamentos: [
      { id: 1, sku: 'FAR-001', codigo_digemid: 'DIG001', nombre_comercial: 'Amoxicilina 500mg', laboratorio_id: 1, precio_unitario_compra: 12.50 },
      { id: 2, sku: 'FAR-002', codigo_digemid: 'DIG002', nombre_comercial: 'Paracetamol 500mg', laboratorio_id: 1, precio_unitario_compra: 5.00 }
    ],
    ordenes: [
      {
        id: 101,
        numero_oc: 'OC-2026-0101',
        fecha_emision: new Date(Date.now() - 5 * 86400000).toISOString(),
        fecha_entrega_pactada: new Date(Date.now() - 2 * 86400000).toISOString(),
        terminos_pago: 'Crédito 30d',
        moneda: 'PEN',
        subtotal: 2000,
        igv: 360,
        total: 2360,
        estado_erp: 'INGRESADO_CON_OBSERVACION',
        items_count: 2,
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        laboratorio: { id: 1, ruc: '20100018625', razon_social: 'Farmindustria S.A.', nombre_comercial: 'Farmindustria' },
        items: [
          { item_nro: 1, sku: 'FAR-001', nombre_comercial: 'Amoxicilina 500mg', cantidad_solicitada: 100, precio_unitario_pactado: 10, subtotal_linea: 1000 },
          { item_nro: 2, sku: 'FAR-002', nombre_comercial: 'Paracetamol 500mg', cantidad_solicitada: 200, precio_unitario_pactado: 5, subtotal_linea: 1000 }
        ]
      },
      {
        id: 102,
        numero_oc: 'OC-2026-0102',
        fecha_emision: new Date(Date.now() - 1 * 86400000).toISOString(),
        fecha_entrega_pactada: new Date(Date.now() + 2 * 86400000).toISOString(),
        terminos_pago: 'Contado',
        moneda: 'PEN',
        subtotal: 500,
        igv: 90,
        total: 590,
        estado_erp: 'RECEPCIONADO_CONFORME',
        items_count: 1,
        created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 3600000).toISOString(),
        laboratorio: { id: 1, ruc: '20100018625', razon_social: 'Farmindustria S.A.', nombre_comercial: 'Farmindustria' },
        items: [
          { item_nro: 1, sku: 'FAR-002', nombre_comercial: 'Paracetamol 500mg', cantidad_solicitada: 100, precio_unitario_pactado: 5, subtotal_linea: 500 }
        ]
      }
    ],
    ingresos: [
      {
        id: 201,
        numero_guia_ingreso: 'ING-2026-0201',
        orden_compra_id: 101,
        numero_oc_referencia: 'OC-2026-0101',
        guia_remision: 'GR-001',
        factura_proveedor: 'F001-99',
        fecha_recepcion_fisica: new Date(Date.now() - 1 * 86400000).toISOString(),
        responsable_almacen: 'Carlos M.',
        estado_recepcion_erp: 'INGRESADO_CON_OBSERVACION',
        total_capital_inmovilizado_erp: 1200,
        created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        items_recibidos: [
          { item_nro: 1, sku: 'FAR-001', nombre_comercial: 'Amoxicilina 500mg', cantidad_solicitada: 100, cantidad_recibida_fisica: 100, cantidad_faltante: 0, precio_unitario_pactado_oc: 10, precio_unitario_facturado: 12, diferencia_precio_unitaria: 2, estado_disposicion: 'RETENIDO_ZONA_DEVOLUCION' },
          { item_nro: 2, sku: 'FAR-002', nombre_comercial: 'Paracetamol 500mg', cantidad_solicitada: 200, cantidad_recibida_fisica: 150, cantidad_faltante: 50, precio_unitario_pactado_oc: 5, precio_unitario_facturado: 5, diferencia_precio_unitaria: 0, estado_disposicion: 'INGRESADO_A_STOCK' }
        ]
      },
      {
        id: 202,
        numero_guia_ingreso: 'ING-2026-0202',
        orden_compra_id: 102,
        numero_oc_referencia: 'OC-2026-0102',
        guia_remision: 'GR-002',
        factura_proveedor: 'F001-100',
        fecha_recepcion_fisica: new Date(Date.now() - 1800000).toISOString(),
        responsable_almacen: 'Carlos M.',
        estado_recepcion_erp: 'RECEPCIONADO_CONFORME',
        total_capital_inmovilizado_erp: 0,
        created_at: new Date(Date.now() - 1800000).toISOString(),
        updated_at: new Date(Date.now() - 1800000).toISOString(),
        items_recibidos: [
          { item_nro: 1, sku: 'FAR-002', nombre_comercial: 'Paracetamol 500mg', cantidad_solicitada: 100, cantidad_recibida_fisica: 100, cantidad_faltante: 0, precio_unitario_pactado_oc: 5, precio_unitario_facturado: 5, diferencia_precio_unitaria: 0, estado_disposicion: 'INGRESADO_A_STOCK' }
        ]
      }
    ]
  };

  const erpServer = crearMockErpServer(estadoErp);
  await new Promise(resolve => erpServer.listen(0, '127.0.0.1', resolve));
  const erpPort = erpServer.address().port;
  const erpUrl = `http://127.0.0.1:${erpPort}`;
  process.env.ERP_API_BASE_URL = erpUrl;

  await inicializarBaseDatos();
  await db.query('UPDATE configuracion_sistema SET erp_base_url = $1, erp_api_key = $2 WHERE id = 1', [
    erpUrl,
    'test-erp-key-2026'
  ]);

  const app = createApp();
  const appServer = http.createServer(app);
  await new Promise(resolve => appServer.listen(0, '127.0.0.1', resolve));
  const apiUrl = `http://127.0.0.1:${appServer.address().port}`;

  t.after(async () => {
    await new Promise(resolve => appServer.close(resolve));
    if (erpServer.listening) {
      await new Promise(resolve => erpServer.close(resolve));
    }
  });

  // 1. Bootstrap inicial
  const sync1 = await ejecutarSincronizacion({ tipo: 'STARTUP' });
  assert.equal(sync1.estado, 'EXITOSO', `Sync falló: ${sync1.error || JSON.stringify(sync1)}`);
  assert.equal(sync1.ocs_procesadas, 2);
  assert.equal(sync1.incidencias_detectadas, 3); // Inmovilizado + Faltante + Retraso en OC-101

  // 2. Acceso sin token -> 401
  const noAuth = await apiFetch(apiUrl, '/api/dashboard');
  assert.equal(noAuth.status, 401);

  // 3. Login Gerencia y Empleado
  const loginGer = await apiFetch(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'gerencia@ebenel.com.pe', password: process.env.SEED_GERENCIA_PASSWORD || 'Ebenel2026!' }
  });
  assert.equal(loginGer.status, 200);
  assert.equal(loginGer.data.usuario.rol, 'GERENCIA');
  const tokenGer = loginGer.data.token;

  const loginEmp = await apiFetch(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'logistica@ebenel.com.pe', password: process.env.SEED_EMPLEADO_PASSWORD || 'Ebenel2026!' }
  });
  assert.equal(loginEmp.status, 200);
  assert.equal(loginEmp.data.usuario.rol, 'EMPLEADO');
  const tokenEmp = loginEmp.data.token;

  // 4. Indicador superior (/api/status) y Dashboard
  const statusRes = await apiFetch(apiUrl, '/api/status?check=1', { token: tokenEmp });
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.data.erp_conectado, true);
  assert.equal(statusRes.data.erp_estado, 'ONLINE');
  assert.ok(statusRes.data.ultima_actualizacion_at);

  const dashRes = await apiFetch(apiUrl, '/api/dashboard', { token: tokenEmp });
  assert.equal(dashRes.status, 200);
  assert.equal(dashRes.data.resumen_abastecimiento.total_ocs, 2);
  assert.equal(dashRes.data.rentabilidad.capital_inmovilizado_detectado_pen, 1200);
  assert.equal(dashRes.data.rentabilidad.faltantes_valor_detectado_pen, 250);

  // 5. RBAC estricto: EMPLEADO no puede acceder a /api/admin/* -> 403
  for (const adminPath of ['/api/admin/usuarios', '/api/admin/config', '/api/admin/auditoria']) {
    const r = await apiFetch(apiUrl, adminPath, { token: tokenEmp });
    assert.equal(r.status, 403, `Se esperaba 403 en ${adminPath}`);
  }
  const empSync = await apiFetch(apiUrl, '/api/admin/sync', { method: 'POST', token: tokenEmp });
  assert.equal(empSync.status, 403);

  // 6. EMPLEADO sí puede gestionar incidencia (Nota de Crédito / Liberar Capital)
  const incList = await apiFetch(apiUrl, '/api/incidencias?tipo=PRODUCTO_INMOVILIZADO_PRECIO', { token: tokenEmp });
  assert.equal(incList.status, 200);
  assert.equal(incList.data.data.length, 1);
  const incId = incList.data.data[0].id;

  const patchInc = await apiFetch(apiUrl, `/api/incidencias/${incId}`, {
    method: 'PATCH',
    token: tokenEmp,
    body: {
      estado_gestion: 'RESUELTA_CAPITAL_LIBERADO',
      documento_respaldo: 'NC-F001-00421',
      monto_liberado: 1200,
      observaciones_gestion: 'Nota de crédito emitida por laboratorio y stock liberado a almacén.'
    }
  });
  assert.equal(patchInc.status, 200);
  assert.equal(patchInc.data.data.estado_gestion, 'RESUELTA_CAPITAL_LIBERADO');
  assert.equal(Number(patchInc.data.data.monto_liberado), 1200);

  // 6.b EMPLEADO gestiona faltantes por partes con recordatorio variable y cálculo automático
  const faltanteList = await apiFetch(apiUrl, '/api/incidencias?tipo=ENTREGA_INCOMPLETA', { token: tokenEmp });
  assert.equal(faltanteList.status, 200);
  assert.equal(faltanteList.data.data.length, 1);
  const faltanteId = faltanteList.data.data[0].id;

  const patchFaltanteParcial = await apiFetch(apiUrl, `/api/incidencias/${faltanteId}`, {
    method: 'PATCH',
    token: tokenEmp,
    body: {
      estado_gestion: 'EN_GESTION',
      cantidad_regularizada: 20,
      fecha_compromiso_entrega: '2026-11-25',
      recordatorio_nota: 'Laboratorio despacha lote 1 de 20 unid. por courier.',
      documento_respaldo: 'GR-PARCIAL-01',
      observaciones_gestion: 'Entrega por lotes acordada con compras.'
    }
  });
  assert.equal(patchFaltanteParcial.status, 200);
  assert.equal(patchFaltanteParcial.data.data.cantidad_regularizada, 20);
  // 20 unid * S/ 5 = S/ 100
  assert.equal(Number(patchFaltanteParcial.data.data.monto_liberado), 100);
  assert.equal(patchFaltanteParcial.data.data.recordatorio_nota, 'Laboratorio despacha lote 1 de 20 unid. por courier.');
  assert.ok(patchFaltanteParcial.data.data.fecha_compromiso_entrega);

  // Regularizar lote restante (50 de 50) y resolver
  const patchFaltanteTotal = await apiFetch(apiUrl, `/api/incidencias/${faltanteId}`, {
    method: 'PATCH',
    token: tokenEmp,
    body: {
      estado_gestion: 'RESUELTA_CAPITAL_LIBERADO',
      cantidad_regularizada: 50,
      documento_respaldo: 'GR-FINAL-02'
    }
  });
  assert.equal(patchFaltanteTotal.status, 200);
  assert.equal(patchFaltanteTotal.data.data.cantidad_regularizada, 50);
  assert.equal(Number(patchFaltanteTotal.data.data.monto_liberado), 250); // 50 * 5 = 250
  assert.equal(patchFaltanteTotal.data.data.estado_gestion, 'RESUELTA_CAPITAL_LIBERADO');

  // Rentabilidad refleja capital inmovilizado liberado (1200) + faltante recuperado (250) + lucro cesante recuperado (20% de 1450 = 290)
  const repRes = await apiFetch(apiUrl, '/api/reportes/rentabilidad', { token: tokenEmp });
  assert.equal(repRes.status, 200);
  assert.equal(repRes.data.rentabilidad.capital_inmovilizado_liberado_pen, 1200);
  assert.equal(repRes.data.rentabilidad.faltantes_valor_recuperado_pen, 250);
  assert.equal(repRes.data.rentabilidad.lucro_cesante_recuperado_pen, 290);

  // CSV con UTF-8 BOM
  const csvRes = await apiFetch(apiUrl, '/api/reportes/export-csv', { token: tokenEmp });
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.data.includes('NC-F001-00421'));

  // 7. GERENCIA gestiona trabajadores, revoca acceso en vivo y consulta auditoría
  const crearTrab = await apiFetch(apiUrl, '/api/admin/usuarios', {
    method: 'POST',
    token: tokenGer,
    body: {
      nombre_completo: 'María Operadora',
      email: 'maria@ebenel.com.pe',
      password: 'Password123!',
      cargo: 'Analista de Almacén',
      rol: 'EMPLEADO'
    }
  });
  assert.equal(crearTrab.status, 201);
  const mariaId = crearTrab.data.usuario.id;

  const loginMaria = await apiFetch(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'maria@ebenel.com.pe', password: 'Password123!' }
  });
  assert.equal(loginMaria.status, 200);
  const tokenMaria = loginMaria.data.token;

  // Revocar acceso de María
  const revocarMaria = await apiFetch(apiUrl, `/api/admin/usuarios/${mariaId}/acceso`, {
    method: 'PATCH',
    token: tokenGer,
    body: { activo: false }
  });
  assert.equal(revocarMaria.status, 200);
  assert.equal(revocarMaria.data.usuario.activo, false);

  // El token activo de María deja de servir inmediatamente y no puede volver a loguear
  const mariaAfterRevoke = await apiFetch(apiUrl, '/api/dashboard', { token: tokenMaria });
  assert.equal(mariaAfterRevoke.status, 401);

  const mariaLoginBlocked = await apiFetch(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'maria@ebenel.com.pe', password: 'Password123!' }
  });
  assert.equal(mariaLoginBlocked.status, 403);

  // Restaurar acceso permite nuevo login
  const restaurarMaria = await apiFetch(apiUrl, `/api/admin/usuarios/${mariaId}/acceso`, {
    method: 'PATCH',
    token: tokenGer,
    body: { activo: true }
  });
  assert.equal(restaurarMaria.status, 200);
  const mariaRelogin = await apiFetch(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'maria@ebenel.com.pe', password: 'Password123!' }
  });
  assert.equal(mariaRelogin.status, 200);

  // Auditoría registra login, gestión de empleado y revocación
  const audRes = await apiFetch(apiUrl, '/api/admin/auditoria', { token: tokenGer });
  assert.equal(audRes.status, 200);
  const acciones = audRes.data.data.map(a => a.accion);
  assert.ok(acciones.includes('LIBERAR_CAPITAL_INCIDENCIA'));
  assert.ok(acciones.includes('CREAR_TRABAJADOR'));
  assert.ok(acciones.includes('REVOCAR_ACCESO_TRABAJADOR'));
  assert.ok(acciones.includes('EXPORTAR_REPORTE_CSV'));

  // 8. Resiliencia si ERP se cae (OFFLINE)
  await new Promise(resolve => erpServer.close(resolve));
  const syncOffline = await ejecutarSincronizacion({ tipo: 'AUTO_CRON' });
  assert.equal(syncOffline.estado, 'ERROR_OFFLINE');
  assert.equal(syncOffline.erp_api_online, false);

  const statusOffline = await apiFetch(apiUrl, '/api/status?check=1', { token: tokenGer });
  assert.equal(statusOffline.status, 200);
  assert.equal(statusOffline.data.erp_conectado, false);
  assert.equal(statusOffline.data.erp_estado, 'OFFLINE');

  // El dashboard histórico sigue operativo pese a que el ERP cayó
  const dashOffline = await apiFetch(apiUrl, '/api/dashboard', { token: tokenGer });
  assert.equal(dashOffline.status, 200);
  assert.equal(dashOffline.data.resumen_abastecimiento.total_ocs, 2);

  // 9. Detección automática de reinicio (last_reset_at) al volver el ERP en línea con nueva data
  estadoErp.last_reset_at = '2026-11-11T15:30:00.000Z';
  estadoErp.ordenes = [
    {
      ...estadoErp.ordenes[1],
      id: 999,
      numero_oc: 'OC-2026-0999'
    }
  ];
  estadoErp.ingresos = [
    {
      ...estadoErp.ingresos[1],
      id: 888,
      numero_guia_ingreso: 'ING-2026-0888',
      orden_compra_id: 999,
      numero_oc_referencia: 'OC-2026-0999'
    }
  ];

  const erpServer2 = crearMockErpServer(estadoErp);
  await new Promise(resolve => erpServer2.listen(erpPort, '127.0.0.1', resolve));
  t.after(async () => {
    if (erpServer2.listening) {
      await new Promise(resolve => erpServer2.close(resolve));
    }
  });

  const cfgRes = await apiFetch(apiUrl, '/api/admin/config', { token: tokenGer });
  assert.equal(cfgRes.status, 200);
  assert.equal(cfgRes.data.config.tiene_erp_api_key, true);
  assert.ok(cfgRes.data.config.erp_api_key_masked.includes('*'));

  const testErpRes = await apiFetch(apiUrl, '/api/admin/test-erp', { method: 'POST', token: tokenGer });
  assert.equal(testErpRes.status, 200);
  assert.equal(testErpRes.data.conectado, true);

  const syncAfterReset = await ejecutarSincronizacion({ tipo: 'AUTO_CRON' });
  assert.equal(syncAfterReset.estado, 'EXITOSO');
  assert.equal(syncAfterReset.tipo, 'RESYNC_RESET');
  assert.equal(syncAfterReset.ocs_procesadas, 1);

  const ocRes = await apiFetch(apiUrl, '/api/ordenes-compra', { token: tokenGer });
  assert.equal(ocRes.status, 200);
  assert.equal(ocRes.data.total, 1);
  assert.equal(ocRes.data.data[0].numero_oc, 'OC-2026-0999');
});
