const test = require('node:test');
const assert = require('node:assert/strict');
const { conciliarOrdenCompra } = require('../src/services/reconciliationEngine');

function buildOC(overrides = {}) {
  return {
    id: 10,
    numero_oc: 'OC-2026-0010',
    laboratorio_id: 1,
    laboratorio_razon: 'Farmindustria S.A.',
    fecha_emision: '2026-11-01T08:00:00.000Z',
    fecha_entrega_pactada: '2026-11-04T18:00:00.000Z',
    total: 1000,
    items: [
      {
        item_nro: 1,
        sku: 'MED-001',
        nombre_comercial: 'Amoxicilina 500mg',
        cantidad_solicitada: 100,
        precio_unitario_pactado: 10
      }
    ],
    ...overrides
  };
}

test('OC recibida 100% conforme dentro del plazo pactado', () => {
  const oc = buildOC();
  const ingreso = {
    id: 50,
    numero_guia_ingreso: 'ING-2026-0050',
    fecha_recepcion_fisica: '2026-11-04T12:00:00.000Z',
    items_recibidos: [
      {
        item_nro: 1,
        sku: 'MED-001',
        cantidad_recibida_fisica: 100,
        cantidad_faltante: 0,
        precio_unitario_facturado: 10,
        estado_disposicion: 'INGRESADO_A_STOCK'
      }
    ]
  };

  const res = conciliarOrdenCompra(oc, ingreso, { tolerancia_precio_pct: 0, tolerancia_dias_retraso: 0 });
  assert.equal(res.estado_conciliacion, 'CONFORME');
  assert.equal(res.cantidad_incidencias, 0);
  assert.equal(res.fill_rate_unidades_pct, 100);
  assert.equal(res.monto_faltante, 0);
  assert.equal(res.monto_inmovilizado, 0);
  assert.equal(res.dias_retraso, 0);
});

test('Detecta Entrega Incompleta (Faltantes) y calcula monto faltante y Fill Rate exacto', () => {
  const oc = buildOC();
  const ingreso = {
    id: 51,
    numero_guia_ingreso: 'ING-2026-0051',
    fecha_recepcion_fisica: '2026-11-03T15:00:00.000Z',
    items_recibidos: [
      {
        item_nro: 1,
        sku: 'MED-001',
        cantidad_recibida_fisica: 60,
        cantidad_faltante: 40,
        precio_unitario_facturado: 10,
        estado_disposicion: 'INGRESADO_A_STOCK'
      }
    ]
  };

  const res = conciliarOrdenCompra(oc, ingreso, { tolerancia_precio_pct: 0, tolerancia_dias_retraso: 0 });
  assert.equal(res.estado_conciliacion, 'CON_INCIDENCIAS');
  assert.equal(res.cantidad_incidencias, 1);
  assert.equal(res.monto_faltante, 400);
  assert.equal(res.fill_rate_unidades_pct, 60);
  assert.equal(res.incidencias[0].tipo_incidencia, 'ENTREGA_INCOMPLETA');
  assert.equal(res.incidencias[0].severidad, 'ALTA');
  assert.equal(res.incidencias[0].cantidad_afectada, 40);
});

test('Detecta Producto Inmovilizado por Diferencia de Precio y respeta tolerancia si no está retenido', () => {
  const oc = buildOC();
  const ingresoSobreprecio = {
    id: 52,
    numero_guia_ingreso: 'ING-2026-0052',
    fecha_recepcion_fisica: '2026-11-04T10:00:00.000Z',
    items_recibidos: [
      {
        item_nro: 1,
        sku: 'MED-001',
        cantidad_recibida_fisica: 100,
        cantidad_faltante: 0,
        precio_unitario_facturado: 11.5,
        estado_disposicion: 'RETENIDO_ZONA_DEVOLUCION'
      }
    ]
  };

  const res = conciliarOrdenCompra(oc, ingresoSobreprecio, { tolerancia_precio_pct: 0, tolerancia_dias_retraso: 0 });
  assert.equal(res.estado_conciliacion, 'CON_INCIDENCIAS');
  assert.equal(res.monto_inmovilizado, 1150);
  assert.equal(res.fill_rate_unidades_pct, 0);
  assert.equal(res.incidencias[0].tipo_incidencia, 'PRODUCTO_INMOVILIZADO_PRECIO');

  // Variación de 1.5% dentro de tolerancia de 2% sin retención física
  const ingresoDentroTolerancia = {
    id: 53,
    numero_guia_ingreso: 'ING-2026-0053',
    fecha_recepcion_fisica: '2026-11-04T10:00:00.000Z',
    items_recibidos: [
      {
        item_nro: 1,
        sku: 'MED-001',
        cantidad_recibida_fisica: 100,
        cantidad_faltante: 0,
        precio_unitario_facturado: 10.15,
        estado_disposicion: 'INGRESADO_A_STOCK'
      }
    ]
  };

  const resTol = conciliarOrdenCompra(oc, ingresoDentroTolerancia, { tolerancia_precio_pct: 2, tolerancia_dias_retraso: 0 });
  assert.equal(resTol.estado_conciliacion, 'CONFORME');
  assert.equal(resTol.cantidad_incidencias, 0);
});

test('Detecta OC vencida sin entrega en tránsito y retraso al recibir con tolerancia configurable', () => {
  const oc = buildOC();

  // Dentro de plazo -> PENDIENTE_RECEPCION
  const antesPlazo = conciliarOrdenCompra(oc, null, { tolerancia_dias_retraso: 0 }, new Date('2026-11-04T10:00:00.000Z'));
  assert.equal(antesPlazo.estado_conciliacion, 'PENDIENTE_RECEPCION');
  assert.equal(antesPlazo.cantidad_incidencias, 0);

  // Vencida sin ingreso -> VENCIDA_SIN_ENTREGA + incidencia RETRASO_ENTREGA
  const vencida = conciliarOrdenCompra(oc, null, { tolerancia_dias_retraso: 0 }, new Date('2026-11-08T18:00:00.000Z'));
  assert.equal(vencida.estado_conciliacion, 'VENCIDA_SIN_ENTREGA');
  assert.equal(vencida.cantidad_incidencias, 1);
  assert.equal(vencida.dias_retraso, 4);
  assert.equal(vencida.incidencias[0].tipo_incidencia, 'RETRASO_ENTREGA');
  assert.equal(vencida.incidencias[0].severidad, 'ALTA');

  // Llegó 1 día tarde pero tolerancia es 2 días -> CONFORME
  const ingresoTardeTolerado = {
    id: 54,
    numero_guia_ingreso: 'ING-2026-0054',
    fecha_recepcion_fisica: '2026-11-05T17:00:00.000Z',
    items_recibidos: [
      {
        item_nro: 1,
        sku: 'MED-001',
        cantidad_recibida_fisica: 100,
        cantidad_faltante: 0,
        precio_unitario_facturado: 10,
        estado_disposicion: 'INGRESADO_A_STOCK'
      }
    ]
  };
  const resTolerado = conciliarOrdenCompra(oc, ingresoTardeTolerado, { tolerancia_dias_retraso: 2 });
  assert.equal(resTolerado.estado_conciliacion, 'CONFORME');
});

test('Detecta múltiples anomalías combinadas en una misma OC (faltante + precio + retraso)', () => {
  const oc = buildOC({
    total: 2000,
    items: [
      { item_nro: 1, sku: 'MED-001', nombre_comercial: 'Item A', cantidad_solicitada: 100, precio_unitario_pactado: 10 },
      { item_nro: 2, sku: 'MED-002', nombre_comercial: 'Item B', cantidad_solicitada: 50, precio_unitario_pactado: 20 }
    ]
  });
  const ingreso = {
    id: 55,
    numero_guia_ingreso: 'ING-2026-0055',
    fecha_recepcion_fisica: '2026-11-07T18:00:00.000Z',
    items_recibidos: [
      { item_nro: 1, sku: 'MED-001', cantidad_recibida_fisica: 80, cantidad_faltante: 20, precio_unitario_facturado: 10, estado_disposicion: 'INGRESADO_A_STOCK' },
      { item_nro: 2, sku: 'MED-002', cantidad_recibida_fisica: 50, cantidad_faltante: 0, precio_unitario_facturado: 24, estado_disposicion: 'RETENIDO_ZONA_DEVOLUCION' }
    ]
  };

  const res = conciliarOrdenCompra(oc, ingreso, { tolerancia_precio_pct: 0, tolerancia_dias_retraso: 0 });
  assert.equal(res.estado_conciliacion, 'CON_INCIDENCIAS');
  assert.equal(res.cantidad_incidencias, 3);
  const tipos = res.incidencias.map(i => i.tipo_incidencia).sort();
  assert.deepEqual(tipos, ['ENTREGA_INCOMPLETA', 'PRODUCTO_INMOVILIZADO_PRECIO', 'RETRASO_ENTREGA']);
  assert.equal(res.monto_faltante, 200);
  assert.equal(res.monto_inmovilizado, 1200);
  assert.equal(res.dias_retraso, 3);
});
