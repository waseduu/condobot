const express = require('express');
const db = require('../database');
const requireAuth = require('../middlewares/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const { busca, ativo } = req.query;
  let query = 'SELECT * FROM moradores';
  let params = [];
  const conditions = [];

  if (busca) {
    conditions.push('(nome LIKE ? OR lote LIKE ? OR telefone LIKE ?)');
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  if (ativo === '1' || ativo === '0') {
    conditions.push('ativo = ?');
    params.push(ativo);
  }

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY nome ASC';

  const moradores = db.prepare(query).all(...params);
  res.render('moradores', { moradores, busca: busca || '', filtroAtivo: ativo || '' });
});

router.post('/', requireAuth, (req, res) => {
  const { nome, telefone, lote, observacoes, ativo } = req.body;
  if (!nome || !lote) {
    return res.redirect('/moradores?erro=Nome e lote são obrigatórios');
  }
  db.prepare('INSERT INTO moradores (nome, telefone, lote, observacoes, ativo) VALUES (?, ?, ?, ?, ?)').run(
    nome, telefone || '', lote, observacoes || '', ativo === 'on' ? 1 : 1
  );
  res.redirect('/moradores');
});

router.post('/editar/:id', requireAuth, (req, res) => {
  const { nome, telefone, lote, observacoes } = req.body;
  const ativo = req.body.ativo === 'on' ? 1 : 0;
  db.prepare('UPDATE moradores SET nome=?, telefone=?, lote=?, observacoes=?, ativo=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
    nome, telefone || '', lote, observacoes || '', ativo, req.params.id
  );
  res.redirect('/moradores');
});

router.post('/excluir/:id', requireAuth, (req, res) => {
  const contribs = db.prepare('SELECT COUNT(*) as count FROM contribuicoes WHERE morador_id = ?').get(req.params.id);
  if (contribs.count > 0) {
    db.prepare('UPDATE moradores SET ativo = 0 WHERE id = ?').run(req.params.id);
  } else {
    db.prepare('DELETE FROM moradores WHERE id = ?').run(req.params.id);
  }
  res.redirect('/moradores');
});

router.get('/dados/:id', requireAuth, (req, res) => {
  const morador = db.prepare('SELECT * FROM moradores WHERE id = ?').get(req.params.id);
  res.json(morador);
});

module.exports = router;
