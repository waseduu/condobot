const express = require('express');
const db = require('../database');
const requireAuth = require('../middlewares/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const totalMoradores = db.prepare('SELECT COUNT(*) as total FROM moradores WHERE ativo = 1').get();
  const totalContribuicoes = db.prepare('SELECT COUNT(*) as total FROM contribuicoes').get();
  const pagas = db.prepare("SELECT COUNT(*) as total FROM contribuicoes WHERE status = 'Pago'").get();
  const pendentes = db.prepare("SELECT COUNT(*) as total FROM contribuicoes WHERE status = 'Pendente'").get();
  const arrecadado = db.prepare("SELECT COALESCE(SUM(valor), 0) as total FROM contribuicoes WHERE status = 'Pago'").get();

  const totalEntradas = db.prepare('SELECT COALESCE(SUM(valor), 0) as total FROM entradas').get();
  const totalSaidas = db.prepare('SELECT COALESCE(SUM(valor), 0) as total FROM saidas').get();
  const saldoAtual = totalEntradas.total - totalSaidas.total + arrecadado.total;

  const recentes = db.prepare(`
    SELECT c.id, m.nome, c.valor, c.mes_referencia, c.status, c.data_pagamento
    FROM contribuicoes c
    JOIN moradores m ON c.morador_id = m.id
    ORDER BY c.created_at DESC LIMIT 10
  `).all();

  res.render('dashboard', {
    totalMoradores: totalMoradores.total,
    totalContribuicoes: totalContribuicoes.total,
    pagas: pagas.total,
    pendentes: pendentes.total,
    arrecadado: arrecadado.total,
    saldoAtual,
    recentes
  });
});

module.exports = router;
