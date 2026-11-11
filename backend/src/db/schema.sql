-- ==============================================================================
-- SISTEMA WEB EXTERNO DE AUDITORIA LOGISTICA - DROGUERIA EBENEL
-- ESQUEMA RELACIONAL POSTGRESQL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre_completo VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  cargo VARCHAR(100) NOT NULL DEFAULT 'Operador Logístico',
  rol VARCHAR(20) NOT NULL DEFAULT 'EMPLEADO',
  activo BOOLEAN NOT NULL DEFAULT true,
  token_version INTEGER NOT NULL DEFAULT 1,
  ultimo_acceso TIMESTAMP,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria_sistema (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER,
  usuario_nombre VARCHAR(150),
  usuario_email VARCHAR(150),
  rol VARCHAR(30),
  accion VARCHAR(60) NOT NULL,
  entidad VARCHAR(60),
  entidad_id VARCHAR(80),
  descripcion TEXT NOT NULL,
  detalle_anterior JSONB,
  detalle_nuevo JSONB,
  ip_origen VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configuracion_sistema (
  id INTEGER PRIMARY KEY,
  erp_base_url TEXT NOT NULL,
  erp_api_key TEXT NOT NULL DEFAULT '',
  sync_interval_minutos INTEGER NOT NULL DEFAULT 5,
  tolerancia_precio_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  tolerancia_dias_retraso INTEGER NOT NULL DEFAULT 0,
  margen_rentabilidad_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  costo_hora_operativa NUMERIC(8,2) NOT NULL DEFAULT 6.25,
  horas_manuales_semana NUMERIC(6,2) NOT NULL DEFAULT 8.00,
  despachos_mensuales_base INTEGER NOT NULL DEFAULT 400,
  erp_ultimo_checkpoint_at VARCHAR(60),
  erp_last_reset_at VARCHAR(60),
  ultima_sync_exitosa_at TIMESTAMP,
  ultima_verificacion_erp_at TIMESTAMP,
  erp_api_online BOOLEAN NOT NULL DEFAULT false,
  erp_modo_simulacion VARCHAR(30) NOT NULL DEFAULT 'DESCONOCIDO',
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL,
  estado VARCHAR(30) NOT NULL,
  erp_api_online BOOLEAN NOT NULL DEFAULT false,
  modo_erp_detectado VARCHAR(30) NOT NULL DEFAULT 'DESCONOCIDO',
  ocs_procesadas INTEGER NOT NULL DEFAULT 0,
  ingresos_procesados INTEGER NOT NULL DEFAULT 0,
  incidencias_detectadas INTEGER NOT NULL DEFAULT 0,
  latencia_ms INTEGER NOT NULL DEFAULT 0,
  mensaje_error TEXT,
  ejecutado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS erp_laboratorios (
  id INTEGER PRIMARY KEY,
  ruc VARCHAR(20),
  razon_social VARCHAR(180) NOT NULL,
  nombre_comercial VARCHAR(120),
  direccion VARCHAR(250),
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS erp_medicamentos (
  sku VARCHAR(40) PRIMARY KEY,
  erp_id INTEGER,
  codigo_digemid VARCHAR(30),
  nombre_comercial VARCHAR(160) NOT NULL,
  principio_activo VARCHAR(180),
  concentracion VARCHAR(80),
  forma_farmaceutica VARCHAR(80),
  presentacion VARCHAR(150),
  laboratorio_id INTEGER,
  precio_unitario_compra NUMERIC(10,2),
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS erp_ordenes_compra (
  id INTEGER PRIMARY KEY,
  numero_oc VARCHAR(40) NOT NULL UNIQUE,
  laboratorio_id INTEGER,
  laboratorio_ruc VARCHAR(20),
  laboratorio_razon VARCHAR(180),
  laboratorio_nombre VARCHAR(120),
  fecha_emision TIMESTAMP NOT NULL,
  fecha_entrega_pactada TIMESTAMP NOT NULL,
  fecha_programada_arribo TIMESTAMP,
  terminos_pago VARCHAR(80),
  moneda VARCHAR(10) NOT NULL DEFAULT 'PEN',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  igv NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado_erp VARCHAR(50) NOT NULL,
  items_count INTEGER NOT NULL DEFAULT 0,
  erp_created_at TIMESTAMP,
  erp_updated_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS erp_ordenes_compra_detalle (
  id SERIAL PRIMARY KEY,
  orden_compra_id INTEGER NOT NULL REFERENCES erp_ordenes_compra(id) ON DELETE CASCADE,
  item_nro INTEGER NOT NULL,
  sku VARCHAR(40) NOT NULL,
  nombre_comercial VARCHAR(160) NOT NULL,
  principio_activo VARCHAR(180),
  presentacion VARCHAR(150),
  cantidad_solicitada INTEGER NOT NULL,
  precio_unitario_pactado NUMERIC(10,2) NOT NULL,
  subtotal_linea NUMERIC(12,2) NOT NULL,
  UNIQUE(orden_compra_id, item_nro)
);

CREATE TABLE IF NOT EXISTS erp_ingresos_almacen (
  id INTEGER PRIMARY KEY,
  numero_guia_ingreso VARCHAR(40) NOT NULL UNIQUE,
  orden_compra_id INTEGER NOT NULL UNIQUE,
  numero_oc_referencia VARCHAR(40),
  guia_remision VARCHAR(40),
  factura_proveedor VARCHAR(40),
  fecha_recepcion_fisica TIMESTAMP NOT NULL,
  responsable_almacen VARCHAR(120),
  estado_recepcion_erp VARCHAR(60) NOT NULL,
  total_capital_inmovilizado_erp NUMERIC(12,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  erp_created_at TIMESTAMP,
  erp_updated_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS erp_ingresos_almacen_detalle (
  id SERIAL PRIMARY KEY,
  ingreso_almacen_id INTEGER NOT NULL REFERENCES erp_ingresos_almacen(id) ON DELETE CASCADE,
  item_nro INTEGER NOT NULL,
  sku VARCHAR(40) NOT NULL,
  nombre_comercial VARCHAR(160) NOT NULL,
  cantidad_solicitada INTEGER NOT NULL,
  cantidad_recibida_fisica INTEGER NOT NULL,
  cantidad_faltante INTEGER NOT NULL DEFAULT 0,
  precio_unitario_pactado_oc NUMERIC(10,2) NOT NULL,
  precio_unitario_facturado NUMERIC(10,2) NOT NULL,
  diferencia_precio_unitaria NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado_disposicion VARCHAR(60) NOT NULL,
  lote VARCHAR(50),
  fecha_vencimiento VARCHAR(30),
  UNIQUE(ingreso_almacen_id, item_nro)
);

CREATE TABLE IF NOT EXISTS conciliaciones_oc (
  orden_compra_id INTEGER PRIMARY KEY REFERENCES erp_ordenes_compra(id) ON DELETE CASCADE,
  numero_oc VARCHAR(40) NOT NULL,
  ingreso_id INTEGER,
  estado_conciliacion VARCHAR(40) NOT NULL,
  total_solicitado_unidades INTEGER NOT NULL DEFAULT 0,
  total_recibido_conforme_unidades INTEGER NOT NULL DEFAULT 0,
  fill_rate_unidades_pct NUMERIC(5,2),
  total_pactado NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_faltante NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_inmovilizado NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias_retraso INTEGER NOT NULL DEFAULT 0,
  cantidad_incidencias INTEGER NOT NULL DEFAULT 0,
  resumen_reglas TEXT,
  auditado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidencias_logisticas (
  id SERIAL PRIMARY KEY,
  clave_unica VARCHAR(120) NOT NULL UNIQUE,
  orden_compra_id INTEGER NOT NULL REFERENCES erp_ordenes_compra(id) ON DELETE CASCADE,
  ingreso_id INTEGER,
  numero_oc VARCHAR(40) NOT NULL,
  laboratorio_id INTEGER,
  laboratorio_nombre VARCHAR(180),
  sku VARCHAR(40),
  nombre_producto VARCHAR(160),
  tipo_incidencia VARCHAR(40) NOT NULL,
  severidad VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
  cantidad_solicitada INTEGER NOT NULL DEFAULT 0,
  cantidad_recibida INTEGER NOT NULL DEFAULT 0,
  cantidad_afectada INTEGER NOT NULL DEFAULT 0,
  precio_pactado NUMERIC(10,2) NOT NULL DEFAULT 0,
  precio_facturado NUMERIC(10,2) NOT NULL DEFAULT 0,
  dias_retraso INTEGER NOT NULL DEFAULT 0,
  valor_economico_afectado NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_liberado NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado_gestion VARCHAR(40) NOT NULL DEFAULT 'ABIERTA',
  documento_respaldo VARCHAR(80),
  observaciones_automaticas TEXT,
  observaciones_gestion TEXT,
  gestionado_por INTEGER,
  gestionado_por_nombre VARCHAR(150),
  detectada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resuelta_en TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria_sistema (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_fecha ON sync_logs (ejecutado_en DESC);
CREATE INDEX IF NOT EXISTS idx_oc_fecha_emision ON erp_ordenes_compra (fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_ing_oc_id ON erp_ingresos_almacen (orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_inc_tipo_estado ON incidencias_logisticas (tipo_incidencia, estado_gestion);
CREATE INDEX IF NOT EXISTS idx_inc_detectada ON incidencias_logisticas (detectada_en DESC);
