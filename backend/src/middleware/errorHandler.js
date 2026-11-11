function errorHandler(err, req, res, _next) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error('[BACKEND ERROR]', err);
  }
  res.status(status).json({
    error: err.message || 'Error interno del servidor'
  });
}

module.exports = {
  errorHandler
};
