const dns = require('dns');
const { Pool } = require('pg');
const env = require('../config/env');

// Preferir IPv4 para evitar ENETUNREACH entre Render y Supabase Pooler
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

let customPool = null;
let productionPool = null;

function createProductionPool() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL no configurada. Define la cadena PostgreSQL en variables de entorno.');
  }
  const isLocalHost = env.databaseUrl.includes('localhost') || env.databaseUrl.includes('127.0.0.1');
  return new Pool({
    connectionString: env.databaseUrl,
    ssl: isLocalHost ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
}

function getPool() {
  if (customPool) return customPool;
  if (!productionPool) {
    productionPool = createProductionPool();
  }
  return productionPool;
}

function setTestPool(poolInstance) {
  customPool = poolInstance;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignorar si la transacción ya fue abortada
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  setTestPool,
  query,
  withTransaction
};
