const DEFAULT_TIMEOUT_MS = 65000;

function construirHeaders(apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey && String(apiKey).trim()) {
    headers['x-api-key'] = String(apiKey).trim();
  }
  return headers;
}

async function fetchJsonConReintento(url, { apiKey = '', timeoutMs = DEFAULT_TIMEOUT_MS, reintentos = 1 } = {}) {
  let ultimoError = null;

  for (let intento = 0; intento <= reintentos; intento++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: construirHeaders(apiKey),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        let detalle = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson?.error) detalle = `${detalle}: ${errJson.error}`;
        } catch (_) {
          // Cuerpo no JSON
        }
        const err = new Error(detalle);
        err.statusCode = response.status;
        if (response.status >= 500 && intento < reintentos) {
          ultimoError = err;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timer);
      ultimoError = err.name === 'AbortError'
        ? new Error(`Timeout tras ${Math.round(timeoutMs / 1000)}s al consultar ERP (${url})`)
        : err;
      if (intento < reintentos) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  throw ultimoError;
}

class ErpClient {
  constructor(baseUrl, apiKey = '') {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.apiKey = apiKey || '';
  }

  async checkHealth() {
    return fetchJsonConReintento(`${this.baseUrl}/health`, {
      apiKey: this.apiKey,
      timeoutMs: 25000,
      reintentos: 0
    });
  }

  async fetchCatalogos() {
    const [labs, meds] = await Promise.all([
      fetchJsonConReintento(`${this.baseUrl}/api/v1/erp/laboratorios`, { apiKey: this.apiKey }),
      fetchJsonConReintento(`${this.baseUrl}/api/v1/erp/medicamentos`, { apiKey: this.apiKey })
    ]);
    return {
      laboratorios: labs.data || [],
      medicamentos: meds.data || []
    };
  }

  async fetchPaginadoCompleto(endpointPath, params = {}) {
    const acumulado = [];
    let offset = 0;
    const limit = 50;
    let ultimoPayload = null;

    while (true) {
      const qs = new URLSearchParams({
        ...params,
        limit: String(limit),
        offset: String(offset),
        order: 'asc'
      });
      const json = await fetchJsonConReintento(`${this.baseUrl}${endpointPath}?${qs.toString()}`, {
        apiKey: this.apiKey
      });
      ultimoPayload = json;
      const chunk = json.data || [];
      acumulado.push(...chunk);

      if (!json.has_more || chunk.length === 0) break;
      offset = json.next_offset !== null && json.next_offset !== undefined
        ? Number(json.next_offset)
        : offset + chunk.length;
    }

    return { meta: ultimoPayload, data: acumulado };
  }

  async fetchSincronizarVentana({ desde, hasta = null }) {
    const ocs = [];
    const ingresos = [];
    let offset = 0;
    const limit = 50;
    let metaFinal = null;

    while (true) {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        order: 'asc'
      });
      if (desde) qs.set('desde', desde);
      if (hasta) qs.set('hasta', hasta);

      const json = await fetchJsonConReintento(`${this.baseUrl}/api/v1/erp/sincronizar?${qs.toString()}`, {
        apiKey: this.apiKey
      });
      metaFinal = json;

      if (Array.isArray(json.ordenes_compra)) ocs.push(...json.ordenes_compra);
      if (Array.isArray(json.ingresos_almacen)) ingresos.push(...json.ingresos_almacen);

      const hasMore = Boolean(json.paginacion?.has_more);
      if (!hasMore || ((json.ordenes_compra?.length || 0) === 0 && (json.ingresos_almacen?.length || 0) === 0)) {
        break;
      }
      offset += limit;
    }

    return {
      meta: metaFinal,
      ordenes_compra: deduplicarPorId(ocs),
      ingresos_almacen: deduplicarPorId(ingresos)
    };
  }
}

function deduplicarPorId(lista) {
  const mapa = new Map();
  for (const item of lista) {
    if (item && item.id !== undefined) mapa.set(item.id, item);
  }
  return Array.from(mapa.values());
}

module.exports = {
  ErpClient,
  fetchJsonConReintento
};
