const express = require('express');
const db = require('../database');
const requireAuth = require('../middlewares/auth');
const ExcelJS = require('exceljs');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const { mes } = req.query;
  const meses = [];
  const data = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(data.getFullYear(), data.getMonth() - i, 1);
    meses.push(d.toISOString().slice(0, 7));
  }

  const mesSelecionado = mes || new Date().toISOString().slice(0, 7);

  const contribuicoes = db.prepare(`
    SELECT c.*, m.nome as morador_nome, m.lote as morador_lote
    FROM contribuicoes c
    JOIN moradores m ON c.morador_id = m.id
    WHERE c.mes_referencia = ?
    ORDER BY m.nome ASC
  `).all(mesSelecionado);

  const pagas = contribuicoes.filter(c => c.status === 'Pago');
  const pendentes = contribuicoes.filter(c => c.status === 'Pendente');
  const totalContribuicoes = contribuicoes.length;
  const totalPago = pagas.length;
  const totalPendente = pendentes.length;
  const valorArrecadado = pagas.reduce((sum, c) => sum + c.valor, 0);

  const entradas = db.prepare(`
    SELECT * FROM entradas
    WHERE strftime('%Y-%m', data) = ?
    ORDER BY data ASC
  `).all(mesSelecionado);

  const saidas = db.prepare(`
    SELECT * FROM saidas
    WHERE strftime('%Y-%m', data) = ?
    ORDER BY data ASC
  `).all(mesSelecionado);

  const totalEntradas = entradas.reduce((sum, e) => sum + e.valor, 0);
  const totalSaidas = saidas.reduce((sum, s) => sum + s.valor, 0);
  const saldo = valorArrecadado + totalEntradas - totalSaidas;

  res.render('relatorios', {
    mesSelecionado, meses, contribuicoes, pagas, pendentes,
    totalContribuicoes, totalPago, totalPendente, valorArrecadado,
    entradas, saidas, totalEntradas, totalSaidas, saldo
  });
});

router.get('/exportar', requireAuth, async (req, res) => {
  const { mes } = req.query;
  const mesSelecionado = mes || new Date().toISOString().slice(0, 7);

  const contribuicoes = db.prepare(`
    SELECT c.*, m.nome as morador_nome, m.lote as morador_lote
    FROM contribuicoes c
    JOIN moradores m ON c.morador_id = m.id
    WHERE c.mes_referencia = ?
    ORDER BY m.nome ASC
  `).all(mesSelecionado);

  const entradas = db.prepare(`
    SELECT * FROM entradas
    WHERE strftime('%Y-%m', data) = ?
    ORDER BY data ASC
  `).all(mesSelecionado);

  const saidas = db.prepare(`
    SELECT * FROM saidas
    WHERE strftime('%Y-%m', data) = ?
    ORDER BY data ASC
  `).all(mesSelecionado);

  const pagas = contribuicoes.filter(c => c.status === 'Pago');
  const totalArrecadado = pagas.reduce((sum, c) => sum + c.valor, 0);
  const totalEntradas = entradas.reduce((sum, e) => sum + e.valor, 0);
  const totalSaidas = saidas.reduce((sum, s) => sum + s.valor, 0);
  const saldo = totalArrecadado + totalEntradas - totalSaidas;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CondoBot';
  wb.created = new Date();

  const styleHeader = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D6EFD' } }, alignment: { horizontal: 'center' } };
  const styleCurrency = { numFmt: '#,##0.00', alignment: { horizontal: 'right' } };

  // Sheet: Contribuições
  const ws1 = wb.addWorksheet('Contribuições');
  ws1.columns = [
    { header: 'Morador', key: 'morador_nome', width: 25 },
    { header: 'Lote', key: 'morador_lote', width: 10 },
    { header: 'Valor', key: 'valor', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Data Pagamento', key: 'data_pagamento', width: 16 }
  ];
  ws1.getRow(1).eachCell(c => { c.font = styleHeader.font; c.fill = styleHeader.fill; c.alignment = styleHeader.alignment; });
  contribuicoes.forEach(c => {
    ws1.addRow({ morador_nome: c.morador_nome, morador_lote: c.morador_lote, valor: c.valor, status: c.status, data_pagamento: c.data_pagamento || '-' });
  });
  ws1.addRow({});
  ws1.addRow({ morador_nome: 'TOTAL PAGO', valor: { formula: `SUMIF(C2:C${contribuicoes.length+1},"Pago",B2:B${contribuicoes.length+1})` } });

  // Sheet: Entradas
  const ws2 = wb.addWorksheet('Entradas');
  ws2.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 40 },
    { header: 'Valor', key: 'valor', width: 14 }
  ];
  ws2.getRow(1).eachCell(c => { c.font = styleHeader.font; c.fill = styleHeader.fill; c.alignment = styleHeader.alignment; });
  entradas.forEach(e => ws2.addRow(e));
  ws2.addRow({});
  ws2.addRow({ data: 'TOTAL', descricao: '', valor: totalEntradas });

  // Sheet: Saídas
  const ws3 = wb.addWorksheet('Saídas');
  ws3.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 40 },
    { header: 'Valor', key: 'valor', width: 14 }
  ];
  ws3.getRow(1).eachCell(c => { c.font = styleHeader.font; c.fill = styleHeader.fill; c.alignment = styleHeader.alignment; });
  saidas.forEach(s => ws3.addRow(s));
  ws3.addRow({});
  ws3.addRow({ data: 'TOTAL', descricao: '', valor: totalSaidas });

  // Sheet: Resumo
  const ws4 = wb.addWorksheet('Resumo');
  ws4.columns = [{ header: 'Indicador', key: 'ind', width: 25 }, { header: 'Valor', key: 'val', width: 20 }];
  ws4.getRow(1).eachCell(c => { c.font = styleHeader.font; c.fill = styleHeader.fill; });
  ws4.addRow({ ind: 'Mês', val: mesSelecionado });
  ws4.addRow({ ind: 'Total Contribuições', val: contribuicoes.length });
  ws4.addRow({ ind: 'Pagas', val: pagas.length });
  ws4.addRow({ ind: 'Pendentes', val: contribuicoes.length - pagas.length });
  ws4.addRow({ ind: 'Arrecadado (Contribuições)', val: totalArrecadado });
  ws4.addRow({ ind: 'Entradas', val: totalEntradas });
  ws4.addRow({ ind: 'Saídas', val: totalSaidas });
  ws4.addRow({ ind: 'Saldo', val: saldo });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-${mesSelecionado}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
