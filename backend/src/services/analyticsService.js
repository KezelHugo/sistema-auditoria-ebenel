const db = require('../db/pool');
const { LIMA_OFFSET_MS, getRangoMesLimaUTC } = require('./timeUtils');

function filtrarPorPeriodo(fechaInput, periodo, ahora = new Date()) {
  if (periodo === 'todo' || !periodo) return true;
  const ms = Date.parse(fechaInput);
  if (Number.isNaN(ms)) return false;

  if (periodo === 'mes_actual') {
    const { inicioMesUTC, finMesUTC } = getRangoMesLimaUTC(ahora);
    return ms >= inicioMesUTC.getTime() && ms < finMesUTC.getTime();
  }
  if (periodo === '30d') {
    return ms >= ahora.getTime() - 30 * 24 * 60 * 60 * 1000;
  }
  if (periodo === '7d') {
    return ms >= ahora.getTime() - 7 * 24 * 60 * 60 * 1000;
  }
  return true;
}

function getMesLimaKey(fechaInput) {
  const ms = Date.parse(fechaInput);
  if (Number.isNaN(ms)) return 'Sin fecha';
  const d = new Date(ms - LIMA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function obtenerAnalitica({ periodo = 'todo', ahora = new Date() } = {}) {
  const [cfgRes, ocRes, concRes, incRes] = await Promise.all([
    db.query('SELECT * FROM configuracion_sistema WHERE id = 1'),
    db.query('SELECT * FROM erp_ordenes_compra ORDER BY fecha_emision DESC'),
    db.query('SELECT * FROM conciliaciones_oc'),
    db.query('SELECT * FROM incidencias_logisticas ORDER BY detectada_en DESC')
  ]);

  const cfg = cfgRes.rows[0] || {
    margen_rentabilidad_pct: 20,
    costo_hora_operativa: 6.25,
    horas_manuales_semana: 8,
    despachos_mensuales_base: 400
  };

  const concPorOc = new Map(concRes.rows.map(c => [c.orden_compra_id, c]));
  const ordenesFiltradas = ocRes.rows.filter(oc => filtrarPorPeriodo(oc.fecha_emision, periodo, ahora));
  const ocIdsPeriodo = new Set(ordenesFiltradas.map(o => o.id));
  const incidenciasFiltradas = incRes.rows.filter(inc => ocIdsPeriodo.has(inc.orden_compra_id));

  let ocsRecepcionadas = 0;
  let ocsConformes = 0;
  let ocsConIncidencias = 0;
  let ocsPendientes = 0;
  let ocsVencidasSinEntrega = 0;
  let totalUnidadesSolicitadasRec = 0;
  let totalUnidadesConformesRec = 0;
  let montoTotalComprado = 0;

  const labsMap = new Map();
  const mensualMap = new Map();

  for (const oc of ordenesFiltradas) {
    montoTotalComprado += Number(oc.total || 0);
    const conc = concPorOc.get(oc.id);
    const estado = conc ? conc.estado_conciliacion : 'PENDIENTE_RECEPCION';

    if (estado === 'CONFORME') {
      ocsRecepcionadas++;
      ocsConformes++;
    } else if (estado === 'CON_INCIDENCIAS') {
      ocsRecepcionadas++;
      ocsConIncidencias++;
    } else if (estado === 'VENCIDA_SIN_ENTREGA') {
      ocsVencidasSinEntrega++;
    } else {
      ocsPendientes++;
    }

    if (conc && (estado === 'CONFORME' || estado === 'CON_INCIDENCIAS')) {
      totalUnidadesSolicitadasRec += Number(conc.total_solicitado_unidades || 0);
      totalUnidadesConformesRec += Number(conc.total_recibido_conforme_unidades || 0);
    }

    const labKey = oc.laboratorio_razon || oc.laboratorio_nombre || 'Sin Laboratorio';
    if (!labsMap.has(labKey)) {
      labsMap.set(labKey, {
        laboratorio: labKey,
        total_ocs: 0,
        ocs_con_fallas: 0,
        incidencias: 0,
        capital_afectado: 0,
        capital_liberado: 0
      });
    }
    const labStat = labsMap.get(labKey);
    labStat.total_ocs++;
    if (estado === 'CON_INCIDENCIAS' || estado === 'VENCIDA_SIN_ENTREGA') {
      labStat.ocs_con_fallas++;
    }

    const mesKey = getMesLimaKey(oc.fecha_emision);
    if (!mensualMap.has(mesKey)) {
      mensualMap.set(mesKey, {
        mes: mesKey,
        total_ocs: 0,
        ocs_conformes: 0,
        ocs_con_incidencias: 0,
        capital_inmovilizado: 0,
        capital_liberado: 0,
        faltantes_valor: 0
      });
    }
    const mStat = mensualMap.get(mesKey);
    mStat.total_ocs++;
    if (estado === 'CONFORME') mStat.ocs_conformes++;
    if (estado === 'CON_INCIDENCIAS' || estado === 'VENCIDA_SIN_ENTREGA') mStat.ocs_con_incidencias++;
  }

  // Contadores por categoría de incidencia y recuperación financiera
  const categoriasPareto = {
    ENTREGA_INCOMPLETA: { tipo: 'ENTREGA_INCOMPLETA', etiqueta: 'Entregas Incompletas (Faltantes)', cantidad: 0, abiertas: 0, resueltas: 0, valor_afectado: 0, valor_liberado: 0 },
    PRODUCTO_INMOVILIZADO_PRECIO: { tipo: 'PRODUCTO_INMOVILIZADO_PRECIO', etiqueta: 'Productos Inmovilizados (Precio)', cantidad: 0, abiertas: 0, resueltas: 0, valor_afectado: 0, valor_liberado: 0 },
    RETRASO_ENTREGA: { tipo: 'RETRASO_ENTREGA', etiqueta: 'Retrasos de Entrega', cantidad: 0, abiertas: 0, resueltas: 0, valor_afectado: 0, valor_liberado: 0 }
  };

  const ocsConIncidenciasSet = new Set();
  const ocsPorTipo = {
    ENTREGA_INCOMPLETA: new Set(),
    PRODUCTO_INMOVILIZADO_PRECIO: new Set(),
    RETRASO_ENTREGA: new Set()
  };

  let capInmovilizadoDetectado = 0;
  let capInmovilizadoLiberado = 0;
  let faltantesDetectado = 0;
  let faltantesRecuperado = 0;
  let incidenciasAbiertas = 0;
  let incidenciasEnGestion = 0;
  let incidenciasResueltas = 0;

  const ocById = new Map(ordenesFiltradas.map(o => [o.id, o]));

  for (const inc of incidenciasFiltradas) {
    ocsConIncidenciasSet.add(inc.orden_compra_id);
    if (ocsPorTipo[inc.tipo_incidencia]) {
      ocsPorTipo[inc.tipo_incidencia].add(inc.orden_compra_id);
    }

    const val = Number(inc.valor_economico_afectado || 0);
    const lib = Number(inc.monto_liberado || 0);

    if (inc.estado_gestion === 'ABIERTA') incidenciasAbiertas++;
    else if (inc.estado_gestion === 'EN_GESTION' || inc.estado_gestion === 'PENDIENTE_RECOJO') incidenciasEnGestion++;
    else incidenciasResueltas++;

    const cat = categoriasPareto[inc.tipo_incidencia];
    if (cat) {
      cat.cantidad++;
      if (['ABIERTA', 'EN_GESTION', 'PENDIENTE_RECOJO'].includes(inc.estado_gestion)) cat.abiertas++;
      else cat.resueltas++;
      cat.valor_afectado = Number((cat.valor_afectado + val).toFixed(2));
      cat.valor_liberado = Number((cat.valor_liberado + lib).toFixed(2));
    }

    if (inc.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO') {
      capInmovilizadoDetectado = Number((capInmovilizadoDetectado + val).toFixed(2));
      capInmovilizadoLiberado = Number((capInmovilizadoLiberado + lib).toFixed(2));
    } else if (inc.tipo_incidencia === 'ENTREGA_INCOMPLETA') {
      faltantesDetectado = Number((faltantesDetectado + val).toFixed(2));
      faltantesRecuperado = Number((faltantesRecuperado + lib).toFixed(2));
    }

    const ocRef = ocById.get(inc.orden_compra_id);
    if (ocRef) {
      const labKey = ocRef.laboratorio_razon || ocRef.laboratorio_nombre || 'Sin Laboratorio';
      const labStat = labsMap.get(labKey);
      if (labStat) {
        labStat.incidencias++;
        if (inc.tipo_incidencia !== 'RETRASO_ENTREGA') {
          labStat.capital_afectado = Number((labStat.capital_afectado + val).toFixed(2));
          labStat.capital_liberado = Number((labStat.capital_liberado + lib).toFixed(2));
        }
      }

      const mesKey = getMesLimaKey(ocRef.fecha_emision);
      const mStat = mensualMap.get(mesKey);
      if (mStat) {
        if (inc.tipo_incidencia === 'PRODUCTO_INMOVILIZADO_PRECIO') {
          mStat.capital_inmovilizado = Number((mStat.capital_inmovilizado + val).toFixed(2));
          mStat.capital_liberado = Number((mStat.capital_liberado + lib).toFixed(2));
        } else if (inc.tipo_incidencia === 'ENTREGA_INCOMPLETA') {
          mStat.faltantes_valor = Number((mStat.faltantes_valor + val).toFixed(2));
        }
      }
    }
  }

  // Ordenar Pareto descendentemente y calcular % acumulado
  const totalIncidencias = incidenciasFiltradas.length;
  const paretoOrdenado = Object.values(categoriasPareto)
    .sort((a, b) => b.cantidad - a.cantidad);
  let acum = 0;
  const pareto = paretoOrdenado.map(item => {
    const pct = totalIncidencias > 0 ? Number(((item.cantidad / totalIncidencias) * 100).toFixed(2)) : 0;
    acum = Number((acum + pct).toFixed(2));
    return {
      ...item,
      porcentaje: pct,
      acumulado_pct: Math.min(100, acum)
    };
  });

  const fillRateOrdenesPct = ocsRecepcionadas > 0
    ? Number(((ocsConformes / ocsRecepcionadas) * 100).toFixed(2))
    : 100;
  const fillRateUnidadesPct = totalUnidadesSolicitadasRec > 0
    ? Number(((totalUnidadesConformesRec / totalUnidadesSolicitadasRec) * 100).toFixed(2))
    : 100;

  const capInmovilizadoPendiente = Number(Math.max(0, capInmovilizadoDetectado - capInmovilizadoLiberado).toFixed(2));
  const faltantesPendiente = Number(Math.max(0, faltantesDetectado - faltantesRecuperado).toFixed(2));
  const tasaLiberacionCapitalPct = capInmovilizadoDetectado > 0
    ? Number(((capInmovilizadoLiberado / capInmovilizadoDetectado) * 100).toFixed(2))
    : 100;

  const margenPct = Number(cfg.margen_rentabilidad_pct || 20);
  const montoMercaderiaRecuperada = Number((capInmovilizadoLiberado + faltantesRecuperado).toFixed(2));
  const montoMercaderiaPendiente = Number((capInmovilizadoPendiente + faltantesPendiente).toFixed(2));
  const lucroCesanteRecuperado = Number((montoMercaderiaRecuperada * (margenPct / 100)).toFixed(2));
  const lucroCesanteEnRiesgo = Number((montoMercaderiaPendiente * (margenPct / 100)).toFixed(2));

  // Ahorro operativo por automatización: 32 horas/mes por cada 100 OCs (0.32 h/OC)
  const horasMensualesBase = Number(cfg.horas_manuales_semana || 8) * 4;
  const horasPorOC = horasMensualesBase / 100;
  const horasAhorradas = Number((ordenesFiltradas.length * horasPorOC).toFixed(1));
  const ahorroOperativoPen = Number((horasAhorradas * Number(cfg.costo_hora_operativa || 6.25)).toFixed(2));

  // Proyección de continuidad de despachos a clientes
  const despachosBase = Number(cfg.despachos_mensuales_base || 400);
  const ocsConFallaActivaSinResolver = new Set(
    incidenciasFiltradas
      .filter(i => ['ABIERTA', 'EN_GESTION', 'PENDIENTE_RECOJO'].includes(i.estado_gestion))
      .map(i => i.orden_compra_id)
  ).size;
  const proporcionFallaActiva = ordenesFiltradas.length > 0 ? ocsConFallaActivaSinResolver / ordenesFiltradas.length : 0;
  const despachosEnRiesgoActual = Math.round(despachosBase * proporcionFallaActiva * 0.9);
  const despachosProtegidosVsBaseline = Math.max(0, 45 - despachosEnRiesgoActual);

  const rankingLaboratorios = Array.from(labsMap.values())
    .map(lab => {
      const conformes = Math.max(0, lab.total_ocs - lab.ocs_con_fallas);
      const confianza = lab.total_ocs > 0 ? Number(((conformes / lab.total_ocs) * 100).toFixed(1)) : 100;
      return {
        ...lab,
        ocs_conformes: conformes,
        porcentaje_confianza: confianza
      };
    })
    .sort((a, b) => b.incidencias - a.incidencias || b.capital_afectado - a.capital_afectado);

  const evolucionMensual = Array.from(mensualMap.values())
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const incidenciasActivas = incidenciasFiltradas.filter(
    i => ['ABIERTA', 'EN_GESTION', 'PENDIENTE_RECOJO'].includes(i.estado_gestion)
  );

  return {
    periodo,
    parametros_roi: {
      margen_rentabilidad_pct: margenPct,
      costo_hora_operativa: Number(cfg.costo_hora_operativa || 6.25),
      horas_manuales_semana: Number(cfg.horas_manuales_semana || 8),
      despachos_mensuales_base: despachosBase
    },
    resumen_abastecimiento: {
      total_ocs: ordenesFiltradas.length,
      ocs_recepcionadas: ocsRecepcionadas,
      ocs_conformes: ocsConformes,
      ocs_con_incidencias: ocsConIncidencias,
      ocs_pendientes: ocsPendientes,
      ocs_vencidas_sin_entrega: ocsVencidasSinEntrega,
      monto_total_comprado_pen: Number(montoTotalComprado.toFixed(2)),
      fill_rate_ordenes_pct: fillRateOrdenesPct,
      fill_rate_unidades_pct: fillRateUnidadesPct
    },
    resumen_incidencias: {
      total_incidencias: totalIncidencias,
      abiertas: incidenciasAbiertas,
      en_gestion: incidenciasEnGestion,
      resueltas: incidenciasResueltas,
      total_ocs_con_incidencias: ocsConIncidenciasSet.size,
      desglose_ocs_afectadas: {
        total_ocs_con_incidencias: ocsConIncidenciasSet.size,
        por_faltantes: ocsPorTipo.ENTREGA_INCOMPLETA ? ocsPorTipo.ENTREGA_INCOMPLETA.size : 0,
        por_retencion_precio: ocsPorTipo.PRODUCTO_INMOVILIZADO_PRECIO ? ocsPorTipo.PRODUCTO_INMOVILIZADO_PRECIO.size : 0,
        por_retraso: ocsPorTipo.RETRASO_ENTREGA ? ocsPorTipo.RETRASO_ENTREGA.size : 0
      },
      tasa_ocs_con_incidencia_pct: ordenesFiltradas.length > 0
        ? Number(((ocsConIncidenciasSet.size / ordenesFiltradas.length) * 100).toFixed(2))
        : 0
    },
    rentabilidad: {
      capital_inmovilizado_detectado_pen: capInmovilizadoDetectado,
      capital_inmovilizado_liberado_pen: capInmovilizadoLiberado,
      capital_inmovilizado_pendiente_pen: capInmovilizadoPendiente,
      tasa_liberacion_capital_pct: tasaLiberacionCapitalPct,
      meta_mensual_capital_pen: 10000.0,
      faltantes_valor_detectado_pen: faltantesDetectado,
      faltantes_valor_recuperado_pen: faltantesRecuperado,
      faltantes_valor_pendiente_pen: faltantesPendiente,
      lucro_cesante_recuperado_pen: lucroCesanteRecuperado,
      lucro_cesante_en_riesgo_pen: lucroCesanteEnRiesgo,
      meta_mensual_lucro_cesante_pen: 2000.0,
      horas_hombre_ahorradas: horasAhorradas,
      ahorro_operativo_pen: ahorroOperativoPen,
      despachos_mensuales_base: despachosBase,
      despachos_riesgo_estimado: despachosEnRiesgoActual,
      despachos_protegidos_vs_linea_base: despachosProtegidosVsBaseline
    },
    pareto,
    ranking_laboratorios: rankingLaboratorios,
    evolucion_mensual: evolucionMensual,
    alertas_recientes: incidenciasActivas
  };
}

function escaparCsv(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function generarReporteCsvIncidencias({ periodo = 'todo' } = {}) {
  const [ocRes, incRes] = await Promise.all([
    db.query('SELECT id, fecha_emision FROM erp_ordenes_compra'),
    db.query('SELECT * FROM incidencias_logisticas ORDER BY detectada_en DESC')
  ]);
  const ahora = new Date();
  const ocIds = new Set(ocRes.rows.filter(o => filtrarPorPeriodo(o.fecha_emision, periodo, ahora)).map(o => o.id));
  const rows = incRes.rows.filter(i => ocIds.has(i.orden_compra_id));

  const cabeceras = [
    'ID Incidencia',
    'Numero OC',
    'Laboratorio',
    'Tipo Incidencia',
    'Severidad',
    'SKU',
    'Producto',
    'Cantidad Solicitada',
    'Cantidad Recibida',
    'Cantidad Afectada',
    'Precio Pactado OC (S/)',
    'Precio Facturado (S/)',
    'Dias Retraso',
    'Valor Economico Afectado (S/)',
    'Monto Liberado (S/)',
    'Estado Gestion',
    'Documento Respaldo',
    'Gestionado Por',
    'Observaciones Automaticas',
    'Observaciones Gestion',
    'Detectada En',
    'Resuelta En'
  ];

  const lineas = [cabeceras.join(',')];
  for (const r of rows) {
    lineas.push([
      r.id,
      r.numero_oc,
      r.laboratorio_nombre,
      r.tipo_incidencia,
      r.severidad,
      r.sku || '',
      r.nombre_producto || '',
      r.cantidad_solicitada,
      r.cantidad_recibida,
      r.cantidad_afectada,
      r.precio_pactado,
      r.precio_facturado,
      r.dias_retraso,
      r.valor_economico_afectado,
      r.monto_liberado,
      r.estado_gestion,
      r.documento_respaldo || '',
      r.gestionado_por_nombre || '',
      r.observaciones_automaticas || '',
      r.observaciones_gestion || '',
      r.detectada_en ? new Date(r.detectada_en).toISOString() : '',
      r.resuelta_en ? new Date(r.resuelta_en).toISOString() : ''
    ].map(escaparCsv).join(','));
  }

  return '\uFEFF' + lineas.join('\r\n');
}

module.exports = {
  obtenerAnalitica,
  generarReporteCsvIncidencias,
  filtrarPorPeriodo
};
