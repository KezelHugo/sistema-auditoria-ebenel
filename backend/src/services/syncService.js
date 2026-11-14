const db = require('../db/pool');
const { ErpClient, fetchJsonConReintento } = require('./erpClient');
const { conciliarOrdenCompra } = require('./reconciliationEngine');
const { registrarAuditoria } = require('./auditService');

let syncEnProgreso = false;

function isSyncRunning() {
  return syncEnProgreso;
}

async function obtenerConfigSistema(runner = db) {
  const { rows } = await runner.query('SELECT * FROM configuracion_sistema WHERE id = 1');
  const cfg = rows[0] || {};
  return {
    ...cfg,
    erp_base_url: (cfg.erp_base_url || env.erpBaseUrl || 'https://simulador-erp-ebenel.onrender.com').replace(/\/+$/, ''),
    erp_api_key: (cfg.erp_api_key || env.erpApiKey || 'ebenel_erp_secret_key_2026').trim()
  };
}

async function upsertLaboratorios(client, labs = []) {
  for (const lab of labs) {
    const { rows } = await client.query('SELECT id FROM erp_laboratorios WHERE id = $1', [lab.id]);
    if (rows.length > 0) {
      await client.query(
        `UPDATE erp_laboratorios
         SET ruc = $2, razon_social = $3, nombre_comercial = $4, direccion = $5, synced_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [lab.id, lab.ruc || null, lab.razon_social, lab.nombre_comercial || null, lab.direccion || null]
      );
    } else {
      await client.query(
        `INSERT INTO erp_laboratorios (id, ruc, razon_social, nombre_comercial, direccion, plazo_entrega_dias, synced_at)
         VALUES ($1, $2, $3, $4, $5, 3, CURRENT_TIMESTAMP)`,
        [lab.id, lab.ruc || null, lab.razon_social, lab.nombre_comercial || null, lab.direccion || null]
      );
    }
  }
}

async function upsertMedicamentos(client, meds = []) {
  for (const med of meds) {
    const { rows } = await client.query('SELECT sku FROM erp_medicamentos WHERE sku = $1', [med.sku]);
    if (rows.length > 0) {
      await client.query(
        `UPDATE erp_medicamentos
         SET erp_id = $2, codigo_digemid = $3, nombre_comercial = $4, principio_activo = $5,
             concentracion = $6, forma_farmaceutica = $7, presentacion = $8,
             laboratorio_id = $9, precio_unitario_compra = $10, synced_at = CURRENT_TIMESTAMP
         WHERE sku = $1`,
        [
          med.sku,
          med.id || null,
          med.codigo_digemid || null,
          med.nombre_comercial,
          med.principio_activo_dci || med.principio_activo || null,
          med.concentracion || null,
          med.forma_farmaceutica || null,
          med.presentacion_mayorista || med.presentacion || null,
          med.laboratorio_id || null,
          Number(med.precio_unitario_compra || 0)
        ]
      );
    } else {
      await client.query(
        `INSERT INTO erp_medicamentos (
           sku, erp_id, codigo_digemid, nombre_comercial, principio_activo,
           concentracion, forma_farmaceutica, presentacion, laboratorio_id, precio_unitario_compra, synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
        [
          med.sku,
          med.id || null,
          med.codigo_digemid || null,
          med.nombre_comercial,
          med.principio_activo_dci || med.principio_activo || null,
          med.concentracion || null,
          med.forma_farmaceutica || null,
          med.presentacion_mayorista || med.presentacion || null,
          med.laboratorio_id || null,
          Number(med.precio_unitario_compra || 0)
        ]
      );
    }
  }
}

async function upsertOrdenCompraLocal(client, oc) {
  const lab = oc.laboratorio || {};
  const items = Array.isArray(oc.items) ? oc.items : [];
  const { rows: existing } = await client.query('SELECT id FROM erp_ordenes_compra WHERE id = $1', [oc.id]);

  if (existing.length > 0) {
    await client.query(
      `UPDATE erp_ordenes_compra
       SET numero_oc = $2, laboratorio_id = $3, laboratorio_ruc = $4, laboratorio_razon = $5,
           laboratorio_nombre = $6, fecha_emision = $7, fecha_entrega_pactada = $8,
           fecha_programada_arribo = $9, terminos_pago = $10, moneda = $11,
           subtotal = $12, igv = $13, total = $14, estado_erp = $15, items_count = $16,
           erp_created_at = $17, erp_updated_at = $18, synced_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        oc.id,
        oc.numero_oc,
        lab.id || null,
        lab.ruc || null,
        lab.razon || null,
        lab.nombre_comercial || null,
        new Date(oc.fecha_emision),
        new Date(oc.fecha_entrega_pactada),
        oc.fecha_programada_arribo ? new Date(oc.fecha_programada_arribo) : null,
        oc.terminos_pago || 'Crédito 30 días',
        oc.moneda || 'PEN',
        Number(oc.subtotal || 0),
        Number(oc.igv || 0),
        Number(oc.total || 0),
        oc.estado || 'APROBADA_EN_ESPERA',
        items.length,
        oc.created_at ? new Date(oc.created_at) : null,
        oc.updated_at ? new Date(oc.updated_at) : null
      ]
    );
  } else {
    await client.query(
      `INSERT INTO erp_ordenes_compra (
         id, numero_oc, laboratorio_id, laboratorio_ruc, laboratorio_razon, laboratorio_nombre,
         fecha_emision, fecha_entrega_pactada, fecha_programada_arribo, terminos_pago, moneda,
         subtotal, igv, total, estado_erp, items_count, erp_created_at, erp_updated_at, synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,CURRENT_TIMESTAMP)`,
      [
        oc.id,
        oc.numero_oc,
        lab.id || null,
        lab.ruc || null,
        lab.razon || null,
        lab.nombre_comercial || null,
        new Date(oc.fecha_emision),
        new Date(oc.fecha_entrega_pactada),
        oc.fecha_programada_arribo ? new Date(oc.fecha_programada_arribo) : null,
        oc.terminos_pago || 'Crédito 30 días',
        oc.moneda || 'PEN',
        Number(oc.subtotal || 0),
        Number(oc.igv || 0),
        Number(oc.total || 0),
        oc.estado || 'APROBADA_EN_ESPERA',
        items.length,
        oc.created_at ? new Date(oc.created_at) : null,
        oc.updated_at ? new Date(oc.updated_at) : null
      ]
    );
  }

  await client.query('DELETE FROM erp_ordenes_compra_detalle WHERE orden_compra_id = $1', [oc.id]);
  for (const it of items) {
    await client.query(
      `INSERT INTO erp_ordenes_compra_detalle (
         orden_compra_id, item_nro, sku, nombre_comercial, principio_activo,
         presentacion, cantidad_solicitada, precio_unitario_pactado, subtotal_linea
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        oc.id,
        Number(it.item_nro),
        it.sku,
        it.nombre_comercial,
        it.principio_activo || null,
        it.presentacion || null,
        Number(it.cantidad_solicitada || 0),
        Number(it.precio_unitario_pactado || 0),
        Number(it.subtotal_linea || 0)
      ]
    );
  }
}

async function upsertIngresoAlmacenLocal(client, ing) {
  const items = Array.isArray(ing.items_recibidos) ? ing.items_recibidos : [];
  const { rows: existing } = await client.query('SELECT id FROM erp_ingresos_almacen WHERE id = $1', [ing.id]);

  if (existing.length > 0) {
    await client.query(
      `UPDATE erp_ingresos_almacen
       SET numero_guia_ingreso = $2, orden_compra_id = $3, numero_oc_referencia = $4,
           guia_remision = $5, factura_proveedor = $6, fecha_recepcion_fisica = $7,
           responsable_almacen = $8, estado_recepcion_erp = $9, total_capital_inmovilizado_erp = $10,
           observaciones = $11, erp_created_at = $12, erp_updated_at = $13, synced_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        ing.id,
        ing.numero_guia_ingreso,
        ing.orden_compra_id,
        ing.numero_oc_referencia || null,
        ing.guia_remision || null,
        ing.factura_proveedor || null,
        new Date(ing.fecha_recepcion_fisica),
        ing.responsable_almacen || null,
        ing.estado_recepcion || 'RECEPCION_TOTAL_CONFORME',
        Number(ing.total_capital_inmovilizado || 0),
        ing.observaciones || null,
        ing.created_at ? new Date(ing.created_at) : null,
        ing.updated_at ? new Date(ing.updated_at) : null
      ]
    );
  } else {
    await client.query(
      `INSERT INTO erp_ingresos_almacen (
         id, numero_guia_ingreso, orden_compra_id, numero_oc_referencia,
         guia_remision, factura_proveedor, fecha_recepcion_fisica, responsable_almacen,
         estado_recepcion_erp, total_capital_inmovilizado_erp, observaciones,
         erp_created_at, erp_updated_at, synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)`,
      [
        ing.id,
        ing.numero_guia_ingreso,
        ing.orden_compra_id,
        ing.numero_oc_referencia || null,
        ing.guia_remision || null,
        ing.factura_proveedor || null,
        new Date(ing.fecha_recepcion_fisica),
        ing.responsable_almacen || null,
        ing.estado_recepcion || 'RECEPCION_TOTAL_CONFORME',
        Number(ing.total_capital_inmovilizado || 0),
        ing.observaciones || null,
        ing.created_at ? new Date(ing.created_at) : null,
        ing.updated_at ? new Date(ing.updated_at) : null
      ]
    );
  }

  await client.query('DELETE FROM erp_ingresos_almacen_detalle WHERE ingreso_almacen_id = $1', [ing.id]);
  for (const it of items) {
    await client.query(
      `INSERT INTO erp_ingresos_almacen_detalle (
         ingreso_almacen_id, item_nro, sku, nombre_comercial, cantidad_solicitada,
         cantidad_recibida_fisica, cantidad_faltante, precio_unitario_pactado_oc,
         precio_unitario_facturado, diferencia_precio_unitaria, estado_disposicion,
         lote, fecha_vencimiento
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        ing.id,
        Number(it.item_nro),
        it.sku,
        it.nombre_comercial,
        Number(it.cantidad_solicitada || 0),
        Number(it.cantidad_recibida_fisica || 0),
        Number(it.cantidad_faltante || 0),
        Number(it.precio_unitario_pactado_oc || 0),
        Number(it.precio_unitario_facturado || 0),
        Number(it.diferencia_precio_unitaria || 0),
        it.estado_disposicion || 'INGRESADO_A_STOCK',
        it.lote || null,
        it.fecha_vencimiento || null
      ]
    );
  }
}

async function cargarOrdenConDetalleLocal(client, ocId) {
  const { rows: ocRows } = await client.query('SELECT * FROM erp_ordenes_compra WHERE id = $1', [ocId]);
  if (ocRows.length === 0) return null;
  const oc = ocRows[0];

  const { rows: items } = await client.query(
    'SELECT * FROM erp_ordenes_compra_detalle WHERE orden_compra_id = $1 ORDER BY item_nro ASC',
    [ocId]
  );

  const { rows: ingRows } = await client.query(
    'SELECT * FROM erp_ingresos_almacen WHERE orden_compra_id = $1',
    [ocId]
  );

  let ingreso = null;
  if (ingRows.length > 0) {
    const { rows: ingItems } = await client.query(
      'SELECT * FROM erp_ingresos_almacen_detalle WHERE ingreso_almacen_id = $1 ORDER BY item_nro ASC',
      [ingRows[0].id]
    );
    ingreso = { ...ingRows[0], items_recibidos: ingItems };
  }

  return { oc: { ...oc, items }, ingreso };
}

async function persistirConciliacion(client, resultado) {
  const { rows: exConc } = await client.query(
    'SELECT orden_compra_id FROM conciliaciones_oc WHERE orden_compra_id = $1',
    [resultado.orden_compra_id]
  );

  if (exConc.length > 0) {
    await client.query(
      `UPDATE conciliaciones_oc
       SET numero_oc = $2, ingreso_id = $3, estado_conciliacion = $4,
           total_solicitado_unidades = $5, total_recibido_conforme_unidades = $6,
           fill_rate_unidades_pct = $7, total_pactado = $8, monto_faltante = $9,
           monto_inmovilizado = $10, dias_retraso = $11, cantidad_incidencias = $12,
           resumen_reglas = $13, auditado_en = CURRENT_TIMESTAMP
       WHERE orden_compra_id = $1`,
      [
        resultado.orden_compra_id,
        resultado.numero_oc,
        resultado.ingreso_id,
        resultado.estado_conciliacion,
        resultado.total_solicitado_unidades,
        resultado.total_recibido_conforme_unidades,
        resultado.fill_rate_unidades_pct,
        resultado.total_pactado,
        resultado.monto_faltante,
        resultado.monto_inmovilizado,
        resultado.dias_retraso,
        resultado.cantidad_incidencias,
        resultado.resumen_reglas
      ]
    );
  } else {
    await client.query(
      `INSERT INTO conciliaciones_oc (
         orden_compra_id, numero_oc, ingreso_id, estado_conciliacion,
         total_solicitado_unidades, total_recibido_conforme_unidades, fill_rate_unidades_pct,
         total_pactado, monto_faltante, monto_inmovilizado, dias_retraso,
         cantidad_incidencias, resumen_reglas, auditado_en
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)`,
      [
        resultado.orden_compra_id,
        resultado.numero_oc,
        resultado.ingreso_id,
        resultado.estado_conciliacion,
        resultado.total_solicitado_unidades,
        resultado.total_recibido_conforme_unidades,
        resultado.fill_rate_unidades_pct,
        resultado.total_pactado,
        resultado.monto_faltante,
        resultado.monto_inmovilizado,
        resultado.dias_retraso,
        resultado.cantidad_incidencias,
        resultado.resumen_reglas
      ]
    );
  }

  let nuevasDetectadas = 0;
  for (const inc of resultado.incidencias) {
    const { rows: exInc } = await client.query(
      'SELECT id, estado_gestion FROM incidencias_logisticas WHERE clave_unica = $1',
      [inc.clave_unica]
    );

    if (exInc.length > 0) {
      // Preservar estado_gestion, monto_liberado, documento_respaldo y gestión del usuario
      await client.query(
        `UPDATE incidencias_logisticas
         SET ingreso_id = $2, severidad = $3, cantidad_solicitada = $4, cantidad_recibida = $5,
             cantidad_afectada = $6, precio_pactado = $7, precio_facturado = $8,
             dias_retraso = $9, valor_economico_afectado = $10, observaciones_automaticas = $11,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          exInc[0].id,
          inc.ingreso_id,
          inc.severidad,
          inc.cantidad_solicitada,
          inc.cantidad_recibida,
          inc.cantidad_afectada,
          inc.precio_pactado,
          inc.precio_facturado,
          inc.dias_retraso,
          inc.valor_economico_afectado,
          inc.observaciones_automaticas
        ]
      );
    } else {
      await client.query(
        `INSERT INTO incidencias_logisticas (
           clave_unica, orden_compra_id, ingreso_id, numero_oc, laboratorio_id, laboratorio_nombre,
           sku, nombre_producto, tipo_incidencia, severidad, cantidad_solicitada, cantidad_recibida,
           cantidad_afectada, precio_pactado, precio_facturado, dias_retraso,
           valor_economico_afectado, monto_liberado, estado_gestion, observaciones_automaticas,
           detectada_en, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,'ABIERTA',$18,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        [
          inc.clave_unica,
          inc.orden_compra_id,
          inc.ingreso_id,
          inc.numero_oc,
          inc.laboratorio_id,
          inc.laboratorio_nombre,
          inc.sku,
          inc.nombre_producto,
          inc.tipo_incidencia,
          inc.severidad,
          inc.cantidad_solicitada,
          inc.cantidad_recibida,
          inc.cantidad_afectada,
          inc.precio_pactado,
          inc.precio_facturado,
          inc.dias_retraso,
          inc.valor_economico_afectado,
          inc.observaciones_automaticas
        ]
      );
      nuevasDetectadas++;
    }
  }

  // Si la conciliación actual no detectó retraso para esta OC, pero existía una incidencia previa de RETRASO_ENTREGA aún no resuelta, retirarla
  const tieneRetrasoActual = resultado.incidencias.some(i => i.tipo_incidencia === 'RETRASO_ENTREGA');
  if (!tieneRetrasoActual) {
    await client.query(
      `DELETE FROM incidencias_logisticas
       WHERE orden_compra_id = $1 AND tipo_incidencia = 'RETRASO_ENTREGA' AND estado_gestion IN ('ABIERTA', 'EN_GESTION')`,
      [resultado.orden_compra_id]
    );
  }

  return nuevasDetectadas;
}

async function limpiarEspejoLocal(client) {
  await client.query('DELETE FROM incidencias_logisticas');
  await client.query('DELETE FROM conciliaciones_oc');
  await client.query('DELETE FROM erp_ingresos_almacen_detalle');
  await client.query('DELETE FROM erp_ingresos_almacen');
  await client.query('DELETE FROM erp_ordenes_compra_detalle');
  await client.query('DELETE FROM erp_ordenes_compra');
  await client.query('UPDATE configuracion_sistema SET erp_ultimo_checkpoint_at = NULL WHERE id = 1');
}

async function ejecutarSincronizacion({
  tipo = 'AUTO_CRON',
  clientFactory = null,
  usuario = null,
  ipOrigen = null,
  forzarBootstrap = false
} = {}) {
  if (syncEnProgreso) {
    return { omitido: true, razon: 'Sincronización ya en curso' };
  }

  syncEnProgreso = true;
  const inicioMs = Date.now();

  try {
    const cfg = await obtenerConfigSistema();
    const erp = clientFactory ? clientFactory(cfg) : new ErpClient(cfg.erp_base_url, cfg.erp_api_key);

    const health = await erp.checkHealth();
    const modoErp = health.modo_actual || 'DESCONOCIDO';
    const remoteResetAt = health.last_reset_at || null;

    const { rows: localCountRows } = await db.query('SELECT COUNT(*)::int AS total FROM erp_ordenes_compra');
    const localCount = localCountRows[0].total;

    const { rows: medsCountRows } = await db.query('SELECT COUNT(*)::int AS total FROM erp_medicamentos');
    const necesitaCatalogo = medsCountRows[0].total === 0;

    const resetDetectado = Boolean(
      remoteResetAt && cfg.erp_last_reset_at && remoteResetAt !== cfg.erp_last_reset_at && localCount > 0
    );

    const usarBootstrap = forzarBootstrap || resetDetectado || localCount === 0 || !cfg.erp_ultimo_checkpoint_at;

    let catalogos = null;
    if (usarBootstrap || necesitaCatalogo) {
      catalogos = await erp.fetchCatalogos();
    }

    let ordenes = [];
    let ingresos = [];
    let nuevoCheckpoint = cfg.erp_ultimo_checkpoint_at;
    let tipoFinal = resetDetectado ? 'RESYNC_RESET' : (usarBootstrap ? 'BOOTSTRAP' : tipo);

    if (usarBootstrap) {
      const [ocsRes, ingRes] = await Promise.all([
        erp.fetchPaginadoCompleto('/api/v1/erp/ordenes-compra'),
        erp.fetchPaginadoCompleto('/api/v1/erp/ingresos-almacen')
      ]);
      ordenes = ocsRes.data || [];
      ingresos = ingRes.data || [];
      nuevoCheckpoint = ocsRes.meta?.sync_timestamp || ingRes.meta?.sync_timestamp || health.timestamp || new Date().toISOString();
    } else {
      const baseMs = Date.parse(cfg.erp_ultimo_checkpoint_at);
      const desde = Number.isNaN(baseMs)
        ? new Date(Date.now() - 15 * 60 * 1000).toISOString()
        : new Date(baseMs - 10 * 60 * 1000).toISOString();

      const ventana = await erp.fetchSincronizarVentana({ desde });
      ordenes = ventana.ordenes_compra || [];
      ingresos = ventana.ingresos_almacen || [];
      nuevoCheckpoint = ventana.meta?.sync_timestamp || health.timestamp || new Date().toISOString();
    }

    // Respaldo defensivo: si vino un ingreso cuya OC no figura localmente ni en la ventana, consultarla
    const ocsEnLote = new Set(ordenes.map(o => o.id));
    for (const ing of ingresos) {
      if (!ocsEnLote.has(ing.orden_compra_id)) {
        const { rows: existsOC } = await db.query('SELECT id FROM erp_ordenes_compra WHERE id = $1', [ing.orden_compra_id]);
        if (existsOC.length === 0 || resetDetectado) {
          const ocFaltante = await fetchJsonConReintento(
            `${cfg.erp_base_url.replace(/\/+$/, '')}/api/v1/erp/ordenes-compra/${ing.orden_compra_id}`,
            { apiKey: cfg.erp_api_key }
          );
          if (ocFaltante?.id) {
            ordenes.push(ocFaltante);
            ocsEnLote.add(ocFaltante.id);
          }
        }
      }
    }

    const resumenTx = await db.withTransaction(async client => {
      if (resetDetectado || forzarBootstrap) {
        await limpiarEspejoLocal(client);
      }
      if (catalogos) {
        await upsertLaboratorios(client, catalogos.laboratorios);
        await upsertMedicamentos(client, catalogos.medicamentos);
      }

      for (const oc of ordenes) {
        await upsertOrdenCompraLocal(client, oc);
      }
      for (const ing of ingresos) {
        await upsertIngresoAlmacenLocal(client, ing);
      }

      // Conciliar OCs tocadas + OCs pendientes de arribo (para detectar vencimientos sin ingreso)
      const ocIdsParaAuditar = new Set([
        ...ordenes.map(o => o.id),
        ...ingresos.map(i => i.orden_compra_id)
      ]);

      const { rows: pendientesRows } = await client.query(
        `SELECT id FROM erp_ordenes_compra
         WHERE id NOT IN (SELECT orden_compra_id FROM erp_ingresos_almacen)`
      );
      for (const p of pendientesRows) {
        ocIdsParaAuditar.add(p.id);
      }

      let incidenciasNuevas = 0;
      const ahora = new Date();

      const { rows: labRows } = await client.query('SELECT id, plazo_entrega_dias FROM erp_laboratorios');
      const plazoPorLab = new Map(labRows.map(l => [l.id, Number(l.plazo_entrega_dias || 3)]));

      for (const ocId of ocIdsParaAuditar) {
        const loaded = await cargarOrdenConDetalleLocal(client, ocId);
        if (!loaded) continue;
        const plazoLab = loaded.oc?.laboratorio_id ? plazoPorLab.get(loaded.oc.laboratorio_id) : 3;
        const resConc = conciliarOrdenCompra(loaded.oc, loaded.ingreso, cfg, ahora, plazoLab);
        incidenciasNuevas += await persistirConciliacion(client, resConc);
      }

      await client.query(
        `UPDATE configuracion_sistema
         SET erp_ultimo_checkpoint_at = $1,
             erp_last_reset_at = COALESCE($2, erp_last_reset_at),
             ultima_sync_exitosa_at = CURRENT_TIMESTAMP,
             ultima_verificacion_erp_at = CURRENT_TIMESTAMP,
             erp_api_online = true,
             erp_modo_simulacion = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [nuevoCheckpoint, remoteResetAt, modoErp]
      );

      const latenciaMs = Date.now() - inicioMs;
      await client.query(
        `INSERT INTO sync_logs (
           tipo, estado, erp_api_online, modo_erp_detectado,
           ocs_procesadas, ingresos_procesados, incidencias_detectadas, latencia_ms, ejecutado_en
         ) VALUES ($1, 'EXITOSO', true, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [tipoFinal, modoErp, ordenes.length, ingresos.length, incidenciasNuevas, latenciaMs]
      );

      if (resetDetectado) {
        await registrarAuditoria({
          client,
          usuario,
          accion: 'RESYNC_TRAS_RESET_ERP',
          entidad: 'sync',
          descripcion: 'Se detectó un reinicio de BD en el simulador ERP; se limpió el espejo local y se re-sincronizó desde cero.',
          ipOrigen
        });
      } else if (tipo === 'MANUAL' && usuario) {
        await registrarAuditoria({
          client,
          usuario,
          accion: 'SINCRONIZACION_MANUAL',
          entidad: 'sync',
          descripcion: `Sincronización manual ejecutada (${ordenes.length} OCs, ${ingresos.length} ingresos, ${incidenciasNuevas} nuevas incidencias).`,
          ipOrigen
        });
      }

      return {
        omitido: false,
        estado: 'EXITOSO',
        tipo: tipoFinal,
        erp_api_online: true,
        modo_erp_detectado: modoErp,
        ocs_procesadas: ordenes.length,
        ingresos_procesados: ingresos.length,
        incidencias_detectadas: incidenciasNuevas,
        latencia_ms: latenciaMs,
        checkpoint: nuevoCheckpoint
      };
    });

    return resumenTx;
  } catch (err) {
    const latenciaMs = Date.now() - inicioMs;
    try {
      await db.query(
        `UPDATE configuracion_sistema
         SET erp_api_online = false, ultima_verificacion_erp_at = CURRENT_TIMESTAMP
         WHERE id = 1`
      );
      await db.query(
        `INSERT INTO sync_logs (
           tipo, estado, erp_api_online, modo_erp_detectado,
           ocs_procesadas, ingresos_procesados, incidencias_detectadas,
           latencia_ms, mensaje_error, ejecutado_en
         ) VALUES ($1, 'ERROR_OFFLINE', false, 'DESCONOCIDO', 0, 0, 0, $2, $3, CURRENT_TIMESTAMP)`,
        [tipo, latenciaMs, err.message]
      );
    } catch (_) {
      // No ocultar error original si falla el log
    }

    return {
      omitido: false,
      estado: 'ERROR_OFFLINE',
      erp_api_online: false,
      error: err.message,
      latencia_ms: latenciaMs
    };
  } finally {
    syncEnProgreso = false;
  }
}

async function verificarEstadoErpEnVivo(forzarPing = false) {
  const cfg = await obtenerConfigSistema();
  const ultimoCheckMs = cfg.ultima_verificacion_erp_at ? Date.parse(cfg.ultima_verificacion_erp_at) : 0;
  const haceSegundos = ultimoCheckMs ? (Date.now() - ultimoCheckMs) / 1000 : Infinity;

  if (forzarPing || haceSegundos >= 20) {
    try {
      const erp = new ErpClient(cfg.erp_base_url, cfg.erp_api_key);
      const health = await fetchJsonConReintento(`${erp.baseUrl}/health`, {
        apiKey: cfg.erp_api_key,
        timeoutMs: 6000,
        reintentos: 0
      });
      await db.query(
        `UPDATE configuracion_sistema
         SET erp_api_online = true,
             erp_modo_simulacion = $1,
             ultima_verificacion_erp_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [health.modo_actual || cfg.erp_modo_simulacion || 'DESCONOCIDO']
      );
    } catch (_) {
      await db.query(
        `UPDATE configuracion_sistema
         SET erp_api_online = false, ultima_verificacion_erp_at = CURRENT_TIMESTAMP
         WHERE id = 1`
      );
    }
  }

  const actualizado = await obtenerConfigSistema();
  const { rows: lastLogs } = await db.query(
    'SELECT * FROM sync_logs ORDER BY id DESC LIMIT 1'
  );

  return {
    erp_conectado: Boolean(actualizado.erp_api_online),
    erp_estado: actualizado.erp_api_online ? 'ONLINE' : 'OFFLINE',
    erp_modo_simulacion: actualizado.erp_modo_simulacion,
    erp_base_url: actualizado.erp_base_url,
    ultima_verificacion_at: actualizado.ultima_verificacion_erp_at,
    ultima_actualizacion_at: actualizado.ultima_sync_exitosa_at,
    intervalo_minutos: actualizado.sync_interval_minutos,
    sync_en_progreso: syncEnProgreso,
    ultimo_sync: lastLogs[0] || null,
    servidor_hora: new Date().toISOString()
  };
}

async function reconciliarOrdenesDeLaboratorio(clientOrDb, labId) {
  const { rows: labRows } = await clientOrDb.query(
    'SELECT id, plazo_entrega_dias, razon_social FROM erp_laboratorios WHERE id = $1',
    [labId]
  );
  if (labRows.length === 0) return 0;
  const lab = labRows[0];
  const plazoDias = Number(lab.plazo_entrega_dias || 3);

  const { rows: cfgRows } = await clientOrDb.query('SELECT * FROM configuracion_sistema WHERE id = 1');
  const cfg = cfgRows[0] || {};

  const { rows: ocRows } = await clientOrDb.query(
    'SELECT id FROM erp_ordenes_compra WHERE laboratorio_id = $1',
    [labId]
  );

  const ahora = new Date();
  let incidenciasAfectadas = 0;
  for (const ocRow of ocRows) {
    const loaded = await cargarOrdenConDetalleLocal(clientOrDb, ocRow.id);
    if (!loaded) continue;
    const resConc = conciliarOrdenCompra(loaded.oc, loaded.ingreso, cfg, ahora, plazoDias);
    incidenciasAfectadas += await persistirConciliacion(clientOrDb, resConc);
  }

  return ocRows.length;
}

module.exports = {
  ejecutarSincronizacion,
  verificarEstadoErpEnVivo,
  isSyncRunning,
  obtenerConfigSistema,
  reconciliarOrdenesDeLaboratorio
};
