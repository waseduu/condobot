const express = require('express');
const db = require('../database');
const requireAuth = require('../middlewares/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const entradas = db.prepare('SELECT * FROM entradas ORDER BY data DESC').all();
  const saidas = db.prepare('SELECT * FROM saidas ORDER BY data DESC').all();

  const totalEntradas = db.prepare('SELECT COALESCE(SUM(valor), 0) as total FROM entradas').get();
  const totalSaidas = db.prepare('SELECT COALESCE(SUM(valor), 0) as total FROM saidas').get();
  const contribPago = db.prepare("SELECT COALESCE(SUM(valor), 0) as total FROM contribuicoes WHERE status='Pago'").get();
  const saldo = contribPago.total + totalEntradas.total - totalSaidas.total;

  res.render('financeiro', { entradas, saidas, totalEntradas: totalEntradas.total, totalSaidas: totalSaidas.total, contribPago: contribPago.total, saldo });
});

router.post('/entrada', requireAuth, (req, res) => {
  const { descricao, valor, data, categoria, observacoes } = req.body;
  if (!descricao || !valor || !data) {
    return res.redirect('/financeiro?erro=Preencha todos os campos obrigatórios');
  }
  db.prepare('INSERT INTO entradas (descricao, valor, data, categoria, observacoes) VALUES (?, ?, ?, ?, ?)').run(
    descricao, parseFloat(valor), data, categoria || 'Outras', observacoes || ''
  );
  res.redirect('/financeiro');
});

router.post('/saida', requireAuth, (req, res) => {
  const { descricao, valor, data, categoria, observacoes } = req.body;
  if (!descricao || !valor || !data) {
    return res.redirect('/financeiro?erro=Preencha todos os campos obrigatórios');
  }
  db.prepare('INSERT INTO saidas (descricao, valor, data, categoria, observacoes) VALUES (?, ?, ?, ?, ?)').run(
    descricao, parseFloat(valor), data, categoria || 'Outras', observacoes || ''
  );
  res.redirect('/financeiro');
});

router.post('/entrada/excluir/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM entradas WHERE id=?').run(req.params.id);
  res.redirect('/financeiro');
});

router.post('/saida/excluir/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM saidas WHERE id=?').run(req.params.id);
  res.redirect('/financeiro');
});

module.exports = router;
