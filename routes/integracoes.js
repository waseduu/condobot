const express = require('express');
const db = require('../database');
const requireAuth = require('../middlewares/auth');
const WhatsAppService = require('../services/whatsapp');
const PIXService = require('../services/pix');
const MercadoPagoService = require('../services/mercadopago');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const wppStatus = WhatsAppService.getStatus();
  const pix = PIXService.getConfigs();
  const mp = MercadoPagoService.getConfigs();
  const pixTransacoes = PIXService.getTransacoes(20);
  const wppMensagens = WhatsAppService.getMensagens(20);
  const wppContatos = WhatsAppService.getContatos();

  res.render('integracoes', {
    wppStatus,
    pix,
    mp,
    pixTransacoes,
    wppMensagens,
    wppContatos,
    pixConfigurado: PIXService.isConfigured(),
    mpConfigurado: MercadoPagoService.isConfigured(),
    erro: req.query.erro || null,
    pix_salvo: req.query.pix_salvo || null,
    mp_salvo: req.query.mp_salvo || null,
    wpp_ok: req.query.wpp_ok || null
  });
});

router.post('/pix/salvar', requireAuth, (req, res) => {
  PIXService.saveConfigs(req.body);
  res.redirect('/integracoes?pix_salvo=1');
});

router.post('/whatsapp/testar', requireAuth, async (req, res) => {
  try {
    const { para } = req.body;
    if (!para) return res.redirect('/integracoes?erro=Telefone de destino obrigatório');
    const numero = WhatsAppService.formatarTelefone(para);
    await WhatsAppService.sendMessage(numero, 'Teste do CondoBot - Mensagem enviada com sucesso!');
    res.redirect('/integracoes?wpp_ok=1');
  } catch (err) {
    res.redirect('/integracoes?erro=' + encodeURIComponent(err.message));
  }
});

router.post('/whatsapp/reconectar', requireAuth, async (req, res) => {
  try {
    await WhatsAppService.desconectar();
    WhatsAppService.iniciar();
    res.redirect('/integracoes');
  } catch (err) {
    res.redirect('/integracoes?erro=' + encodeURIComponent(err.message));
  }
});

router.get('/whatsapp/status', requireAuth, (req, res) => {
  res.json(WhatsAppService.getStatus());
});

router.get('/whatsapp/qrcode', requireAuth, (req, res) => {
  const status = WhatsAppService.getStatus();
  if (status.qrCode) {
    const QRCode = require('qrcode');
    QRCode.toDataURL(status.qrCode, (err, url) => {
      if (err) return res.status(500).json({ error: 'Erro ao gerar QR Code' });
      res.json({ qrcode: url, generatedAt: status.qrCodeGeneratedAt });
    });
  } else {
    res.json({ qrcode: null, status: status.status });
  }
});

router.post('/whatsapp/lembrete/:contribuicaoId', requireAuth, async (req, res) => {
  try {
    const contrib = db.prepare(`
      SELECT c.*, m.nome, m.telefone FROM contribuicoes c
      JOIN moradores m ON c.morador_id = m.id WHERE c.id = ?
    `).get(req.params.contribuicaoId);

    if (!contrib) return res.redirect('/contribuicoes?erro=Contribuição não encontrada');
    if (!contrib.telefone) return res.redirect('/contribuicoes?erro=Morador sem telefone');

    await WhatsAppService.sendLembretePagamento(contrib, contrib);
    res.redirect('/contribuicoes?wpp_enviado=1');
  } catch (err) {
    res.redirect('/contribuicoes?erro=' + encodeURIComponent(err.message));
  }
});

router.get('/pix/gerar/:contribuicaoId', requireAuth, (req, res) => {
  try {
    if (!PIXService.isConfigured()) {
      return res.redirect('/integracoes?erro=Configure o PIX primeiro');
    }
    const pixData = PIXService.gerarQRCodeConta(req.params.contribuicaoId);
    res.json(pixData);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/pix/transacoes', requireAuth, (req, res) => {
  const transacoes = PIXService.getTransacoes();
  res.json(transacoes);
});

router.post('/pix/webhook', (req, res) => {
  const result = PIXService.handleWebhook(req.body, req.headers);
  res.status(result.status).json({ status: result.response });
});

router.post('/mercadopago/salvar', requireAuth, (req, res) => {
  MercadoPagoService.saveConfigs(req.body);
  res.redirect('/integracoes?mp_salvo=1');
});

router.post('/mercadopago/criar/:contribuicaoId', requireAuth, async (req, res) => {
  try {
    if (!MercadoPagoService.isConfigured()) {
      return res.status(400).json({ error: 'Configure o Mercado Pago primeiro' });
    }
    const cobranca = await MercadoPagoService.criarCobranca(req.params.contribuicaoId);
    res.json(cobranca);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/mercadopago/webhook', async (req, res) => {
  const result = await MercadoPagoService.handleWebhook(req.body, req.headers);
  res.status(result.status).json({ status: result.response });
});

module.exports = router;
