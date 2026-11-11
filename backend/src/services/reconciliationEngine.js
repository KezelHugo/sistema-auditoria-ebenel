/**
 * Motor Algorítmico Puro de Conciliación Logística (Módulo 2)
 * Realiza el cruce automático línea por línea entre Órdenes de Compra e Ingresos a Almacén:
 *  1) Cantidades solicitadas vs recibidas físicamente -> ENTREGA_INCOMPLETA (~48% Pareto)
 *  2) Precios pactados vs facturados / retención -> PRODUCTO_INMOVILIZADO_PRECIO (~40% Pareto)
 *  3) Fecha entrega pactada vs recepción física / vencimiento pendiente -> RETRASO_ENTREGA (~12% Pareto)
 */

function indexarItemsRecibidos(itemsRecibidos = []) {
  const porItemNro = new Map();
  const porSku = new Map();
  for (const item of itemsRecibidos) {
    if (item.item_nro !== undefined && item.item_nro !== null) {
      porItemNro.set(Number(item.item_nro), item);
    }
    if (item.sku) {
      porSku.set(String(item.sku), item);
    }
  }
  return { porItemNro, porSku };
}

function crearClaveUnica(ocId, tipoIncidencia, sku = null) {
  return `${ocId}:${tipoIncidencia}:${sku || '__OC__'}`;
}

function conciliarOrdenCompra(oc, ingreso = null, config = {}, ahora = new Date()) {
  const toleranciaPrecioPct = Math.max(0, Number(config.tolerancia_precio_pct || 0));
  const toleranciaDiasRetraso = Math.max(0, Number(config.tolerancia_dias_retraso || 0));
  const msDia = 24 * 60 * 60 * 1000;

  const incidencias = [];
  const resumenReglas = [];

  const fechaPactadaMs = Date.parse(oc.fecha_entrega_pactada);
  const fechaLimiteMs = fechaPactadaMs + toleranciaDiasRetraso * msDia;
  const ahoraMs = ahora.getTime();

  let diasRetraso = 0;

  // Regla 3: Retraso en entrega (aplica tanto a recepciones demoradas como a OCs vencidas aún sin arribo)
  if (!Number.isNaN(fechaPactadaMs)) {
    const referenciaMs = ingreso
      ? Date.parse(ingreso.fecha_recepcion_fisica)
      : ahoraMs;

    if (!Number.isNaN(referenciaMs) && referenciaMs > fechaLimiteMs) {
      diasRetraso = Math.max(1, Math.ceil((referenciaMs - fechaPactadaMs) / msDia));
      const descripcionRetraso = ingreso
        ? `Ingreso físico (${ingreso.numero_guia_ingreso}) registrado ${diasRetraso} día(s) después de la fecha pactada.`
        : `Orden de compra vencida aún sin ingreso en almacén (${diasRetraso} día(s) de demora sobre el plazo pactado).`;

      incidencias.push({
        clave_unica: crearClaveUnica(oc.id, 'RETRASO_ENTREGA'),
        orden_compra_id: oc.id,
        ingreso_id: ingreso ? ingreso.id : null,
        numero_oc: oc.numero_oc,
        laboratorio_id: oc.laboratorio_id,
        laboratorio_nombre: oc.laboratorio_razon || oc.laboratorio_nombre || 'Laboratorio Proveedor',
        sku: null,
        nombre_producto: ingreso ? `Ingreso ${ingreso.numero_guia_ingreso}` : 'Orden completa en tránsito demorado',
        tipo_incidencia: 'RETRASO_ENTREGA',
        severidad: diasRetraso >= 3 ? 'ALTA' : 'MEDIA',
        cantidad_solicitada: 0,
        cantidad_recibida: 0,
        cantidad_afectada: 0,
        precio_pactado: 0,
        precio_facturado: 0,
        dias_retraso: diasRetraso,
        valor_economico_afectado: Number(Number(oc.total || 0).toFixed(2)),
        observaciones_automaticas: descripcionRetraso
      });
      resumenReglas.push(`Retraso detectado (${diasRetraso} día(s))`);
    }
  }

  const ocItems = Array.isArray(oc.items) ? oc.items : [];
  const totalSolicitadoUnidades = ocItems.reduce((acc, it) => acc + Number(it.cantidad_solicitada || 0), 0);

  if (!ingreso) {
    const estadoSinIngreso = incidencias.length > 0 ? 'VENCIDA_SIN_ENTREGA' : 'PENDIENTE_RECEPCION';
    return {
      orden_compra_id: oc.id,
      numero_oc: oc.numero_oc,
      ingreso_id: null,
      estado_conciliacion: estadoSinIngreso,
      total_solicitado_unidades: totalSolicitadoUnidades,
      total_recibido_conforme_unidades: 0,
      fill_rate_unidades_pct: null,
      total_pactado: Number(Number(oc.total || 0).toFixed(2)),
      monto_faltante: 0,
      monto_inmovilizado: 0,
      dias_retraso: diasRetraso,
      cantidad_incidencias: incidencias.length,
      resumen_reglas: resumenReglas.join(' | ') || 'En tránsito dentro de plazo',
      incidencias
    };
  }

  // Cruce línea por línea contra la recepción en almacén
  const { porItemNro, porSku } = indexarItemsRecibidos(ingreso.items_recibidos || []);
  let totalRecibidoConformeUnidades = 0;
  let montoFaltante = 0;
  let montoInmovilizado = 0;

  for (const ocItem of ocItems) {
    const solicitada = Number(ocItem.cantidad_solicitada || 0);
    const precioPactado = Number(ocItem.precio_unitario_pactado || 0);

    const rec = porItemNro.get(Number(ocItem.item_nro)) || porSku.get(String(ocItem.sku)) || null;
    const recibida = rec ? Number(rec.cantidad_recibida_fisica ?? 0) : 0;
    const faltanteCalculado = Math.max(0, solicitada - recibida);
    const faltante = rec ? Math.max(Number(rec.cantidad_faltante || 0), faltanteCalculado) : solicitada;
    const precioFacturado = rec ? Number(rec.precio_unitario_facturado ?? precioPactado) : precioPactado;
    const disposicion = rec ? String(rec.estado_disposicion || 'INGRESADO_A_STOCK') : 'NO_RECIBIDO';

    // Regla 1: Entregas Incompletas (Faltantes - 48% Pareto)
    if (faltante > 0) {
      const valorFaltanteItem = Number((faltante * precioPactado).toFixed(2));
      montoFaltante = Number((montoFaltante + valorFaltanteItem).toFixed(2));

      incidencias.push({
        clave_unica: crearClaveUnica(oc.id, 'ENTREGA_INCOMPLETA', ocItem.sku),
        orden_compra_id: oc.id,
        ingreso_id: ingreso.id,
        numero_oc: oc.numero_oc,
        laboratorio_id: oc.laboratorio_id,
        laboratorio_nombre: oc.laboratorio_razon || oc.laboratorio_nombre || 'Laboratorio Proveedor',
        sku: ocItem.sku,
        nombre_producto: ocItem.nombre_comercial,
        tipo_incidencia: 'ENTREGA_INCOMPLETA',
        severidad: faltante >= solicitada * 0.3 ? 'ALTA' : 'MEDIA',
        cantidad_solicitada: solicitada,
        cantidad_recibida: recibida,
        cantidad_afectada: faltante,
        precio_pactado: precioPactado,
        precio_facturado: precioFacturado,
        dias_retraso: 0,
        valor_economico_afectado: valorFaltanteItem,
        observaciones_automaticas: `Faltante en ${ocItem.nombre_comercial}: solicitadas ${solicitada}, recibidas ${recibida}, faltan ${faltante} unid. (Valor S/ ${valorFaltanteItem.toFixed(2)}).`
      });
    }

    // Regla 2: Productos Inmovilizados por Diferencia de Precio (40% Pareto)
    const precioMaxPermitido = precioPactado * (1 + toleranciaPrecioPct / 100);
    const excedePrecio = precioFacturado > precioMaxPermitido + 0.005;
    const estaRetenido = disposicion === 'RETENIDO_ZONA_DEVOLUCION';

    if (estaRetenido || excedePrecio) {
      const unidadesRetenidas = recibida > 0 ? recibida : solicitada;
      const valorRetenidoItem = Number((unidadesRetenidas * precioFacturado).toFixed(2));
      montoInmovilizado = Number((montoInmovilizado + valorRetenidoItem).toFixed(2));
      const pctDiff = precioPactado > 0
        ? Number((((precioFacturado - precioPactado) / precioPactado) * 100).toFixed(2))
        : 0;

      incidencias.push({
        clave_unica: crearClaveUnica(oc.id, 'PRODUCTO_INMOVILIZADO_PRECIO', ocItem.sku),
        orden_compra_id: oc.id,
        ingreso_id: ingreso.id,
        numero_oc: oc.numero_oc,
        laboratorio_id: oc.laboratorio_id,
        laboratorio_nombre: oc.laboratorio_razon || oc.laboratorio_nombre || 'Laboratorio Proveedor',
        sku: ocItem.sku,
        nombre_producto: ocItem.nombre_comercial,
        tipo_incidencia: 'PRODUCTO_INMOVILIZADO_PRECIO',
        severidad: 'ALTA',
        cantidad_solicitada: solicitada,
        cantidad_recibida: recibida,
        cantidad_afectada: unidadesRetenidas,
        precio_pactado: precioPactado,
        precio_facturado: precioFacturado,
        dias_retraso: 0,
        valor_economico_afectado: valorRetenidoItem,
        observaciones_automaticas: `Inmovilizado en zona de devolución (+${pctDiff}%): pactado S/ ${precioPactado.toFixed(2)} vs facturado S/ ${precioFacturado.toFixed(2)} en ${unidadesRetenidas} unid. (Capital retenido S/ ${valorRetenidoItem.toFixed(2)}).`
      });
    } else if (recibida > 0) {
      totalRecibidoConformeUnidades += Math.min(solicitada, recibida);
    }
  }

  if (montoFaltante > 0) resumenReglas.push(`Faltantes S/ ${montoFaltante.toFixed(2)}`);
  if (montoInmovilizado > 0) resumenReglas.push(`Capital inmovilizado S/ ${montoInmovilizado.toFixed(2)}`);

  const fillRate = totalSolicitadoUnidades > 0
    ? Number(((totalRecibidoConformeUnidades / totalSolicitadoUnidades) * 100).toFixed(2))
    : 100;

  return {
    orden_compra_id: oc.id,
    numero_oc: oc.numero_oc,
    ingreso_id: ingreso.id,
    estado_conciliacion: incidencias.length > 0 ? 'CON_INCIDENCIAS' : 'CONFORME',
    total_solicitado_unidades: totalSolicitadoUnidades,
    total_recibido_conforme_unidades: totalRecibidoConformeUnidades,
    fill_rate_unidades_pct: fillRate,
    total_pactado: Number(Number(oc.total || 0).toFixed(2)),
    monto_faltante: montoFaltante,
    monto_inmovilizado: montoInmovilizado,
    dias_retraso: diasRetraso,
    cantidad_incidencias: incidencias.length,
    resumen_reglas: resumenReglas.join(' | ') || 'Recepción 100% conforme',
    incidencias
  };
}

module.exports = {
  conciliarOrdenCompra,
  crearClaveUnica
};
