const express = require('express');
const db = require('../database');
const requireAuth = require('../middlewares/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const { mes, status, morador_id } = req.query;
  let query = `
    SELECT c.*, m.nome as morador_nome, m.lote as morador_lote
    FROM contribuicoes c
    JOIN moradores m ON c.morador_id = m.id
  `;
  const params = [];
  const conditions = [];

  if (mes) {
    conditions.push('c.mes_referencia = ?');
    params.push(mes);
  }
  if (status) {
    conditions.push('c.status = ?');
    params.push(status);
  }
  if (morador_id) {
    conditions.push('c.morador_id = ?');
    params.push(morador_id);
  }

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY c.mes_referencia DESC, m.nome ASC';

  const contribuicoes = db.prepare(query).all(...params);
  const moradores = db.prepare('SELECT id, nome, lote FROM moradores WHERE ativo = 1 ORDER BY nome').all();

  const meses = [];
  const data = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(data.getFullYear(), data.getMonth() - i, 1);
    meses.push(d.toISOString().slice(0, 7));
  }

  res.render('contribuicoes', {
    contribuicoes, moradores, meses,
    filtroMes: mes || '', filtroStatus: status || '', filtroMorador: morador_id || '',
    erro: req.query.erro || null,
    wpp_enviado: req.query.wpp_enviado || null
  });
});

router.post('/registrar', requireAuth, (req, res) => {
  const { morador_id, valor, mes_referencia, data_pagamento, status } = req.body;
  if (!morador_id || !mes_referencia) {
    return res.redirect('/contribuicoes?erro=Dados obrigatórios faltando');
  }

  const existe = db.prepare('SELECT id FROM contribuicoes WHERE morador_id = ? AND mes_referencia = ?').get(morador_id, mes_referencia);
  if (existe) {
    return res.redirect('/contribuicoes?erro=Contribuição já registrada para este mês');
  }

  db.prepare('INSERT INTO contribuicoes (morador_id, valor, mes_referencia, data_pagamento, status) VALUES (?, ?, ?, ?, ?)').run(
    morador_id, valor || 100, mes_referencia, data_pagamento || null, status || 'Pendente'
  );
  res.redirect('/contribuicoes');
});

router.post('/pagar/:id', requireAuth, (req, res) => {
  const { data_pagamento } = req.body;
  db.prepare("UPDATE contribuicoes SET status='Pago', data_pagamento=? WHERE id=?").run(
    data_pagamento || new Date().toISOString().slice(0, 10), req.params.id
  );
  res.redirect('/contribuicoes');
});

router.post('/estornar/:id', requireAuth, (req, res) => {
  db.prepare("UPDATE contribuicoes SET status='Pendente', data_pagamento=NULL WHERE id=?").run(req.params.id);
  res.redirect('/contribuicoes');
});

router.post('/excluir/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM pix_transacoes WHERE contribuicao_id=?').run(req.params.id);
  db.prepare('DELETE FROM contribuicoes WHERE id=?').run(req.params.id);
  res.redirect('/contribuicoes');
});

module.exports = router;
