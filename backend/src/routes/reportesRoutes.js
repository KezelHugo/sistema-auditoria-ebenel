const express = require('express');
const { autenticarJWT } = require('../middleware/auth');
const { obtenerAnalitica } = require('../services/analyticsService');

const router = express.Router();

router.get('/rentabilidad', autenticarJWT, async (req, res, next) => {
  try {
    const periodo = req.query.periodo || 'todo';
    const data = await obtenerAnalitica({ periodo });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
