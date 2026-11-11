const jwt = require('jsonwebtoken');
const db = require('../db/pool');
const env = require('../config/env');

async function autenticarJWT(req, res, next) {
  try {
    const authHeader = req.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sesión requerida: falta cabecera Authorization Bearer.' });
    }

    const token = authHeader.slice(7).trim();
    const payload = jwt.verify(token, env.jwtSecret);

    // Verificar en BD en vivo si el trabajador sigue activo y no se ha revocado su token_version
    const { rows } = await db.query(
      'SELECT id, nombre_completo, email, cargo, rol, activo, token_version FROM usuarios WHERE id = $1',
      [payload.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    const user = rows[0];
    if (!user.activo) {
      return res.status(401).json({ error: 'Tu acceso ha sido revocado o desactivado por Gerencia.' });
    }
    if (Number(user.token_version) !== Number(payload.token_version)) {
      return res.status(401).json({ error: 'Tu sesión expiró porque tus permisos fueron actualizados.' });
    }

    req.usuario = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

module.exports = {
  autenticarJWT
};
