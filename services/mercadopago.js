const { Payment, MercadoPagoConfig, WebhookSignatureValidator } = require('mercadopago');
const db = require('../database');
const crypto = require('crypto');

function getConfig(key) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('mp_' + key);
  return row ? row.valor : null;
}

function setConfig(key, valor) {
  db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run('mp_' + key, valor);
}

const MercadoPagoService = {
  getConfigs() {
    return {
      access_token: getConfig('access_token') || '',
      webhook_secret: getConfig('webhook_secret') || '',
      payer_email: getConfig('payer_email') || '',
      instalacao_id: getConfig('instalacao_id') || ''
    };
  },

  saveConfigs(data) {
    for (const [key, value] of Object.entries(data)) {
      if (['access_token', 'webhook_secret', 'payer_email', 'instalacao_id'].includes(key)) {
        setConfig(key, value);
      }
    }
  },

  isConfigured() {
    return !!getConfig('access_token');
  },

  getClient() {
    const token = getConfig('access_token');
    if (!token) throw new Error('Mercado Pago não configurado');
    return new MercadoPagoConfig({ accessToken: token, options: { timeout: 30000 } });
  },

  async criarCobranca(contribuicaoId) {
    const contrib = db.prepare(`
      SELECT c.*, m.nome as morador_nome, m.lote as morador_lote
      FROM contribuicoes c
      JOIN moradores m ON c.morador_id = m.id
      WHERE c.id = ?
    `).get(contribuicaoId);

    if (!contrib) throw new Error('Contribuição não encontrada');

    const identificador = `CONDO${String(contribuicaoId).padStart(6, '0')}`;
    const payerEmail = getConfig('payer_email') || 'associacao@email.com';

    const client = this.getClient();
    const payment = new Payment(client);

    const body = {
      transaction_amount: contrib.valor,
      description: `Contribuicao ${contrib.mes_referencia} - ${contrib.morador_nome} (Lote ${contrib.morador_lote})`,
      payment_method_id: 'pix',
      payer: { email: payerEmail },
      external_reference: identificador
    };

    const result = await payment.create({ body });
    const pixData = result.point_of_interaction?.transaction_data || {};

    db.prepare(`
      INSERT INTO pix_transacoes (contribuicao_id, identificador, payload, valor, status)
      VALUES (?, ?, ?, ?, 'gerado')
    `).run(contribuicaoId, identificador, JSON.stringify(result), contrib.valor);

    db.prepare('UPDATE contribuicoes SET status = ? WHERE id = ?').run('Aguardando PIX', contribuicaoId);

    return {
      id: result.id,
      identificador,
      valor: contrib.valor,
      status: result.status,
      qrCode: pixData.qr_code || '',
      qrCodeBase64: pixData.qr_code_base64 || '',
      copiaECola: pixData.qr_code || '',
      ticketUrl: pixData.ticket_url || '',
      dataExpiracao: result.date_of_expiration || ''
    };
  },

  async consultarPagamento(paymentId) {
    const client = this.getClient();
    const payment = new Payment(client);
    const result = await payment.get({ id: paymentId });
    return result;
  },

  async handleWebhook(reqBody, reqHeaders) {
    const secret = getConfig('webhook_secret');

    try {
      const validator = new WebhookSignatureValidator(secret);
      const isValid = validator.validate({
        body: JSON.stringify(reqBody),
        signature: reqHeaders['x-signature'] || '',
        requestId: reqHeaders['x-request-id'] || '',
        ts: reqHeaders['x-ts'] || ''
      });
      if (!isValid) {
        console.error('MP: Assinatura inválida');
      }
    } catch (e) {
      console.error('MP: Erro ao validar webhook:', e.message);
    }

    const paymentId = reqBody?.data?.id || reqBody?.id;
    if (!paymentId) {
      return { status: 200, response: 'OK' };
    }

    try {
      const pagamento = await this.consultarPagamento(paymentId);
      const identificador = pagamento.external_reference || '';

      if (pagamento.status === 'approved' && identificador) {
        const pixTransacao = db.prepare('SELECT * FROM pix_transacoes WHERE identificador = ? ORDER BY id DESC').get(identificador);
        if (pixTransacao) {
          db.prepare("UPDATE pix_transacoes SET status = 'confirmado', webhook_recebido = 1 WHERE id = ?").run(pixTransacao.id);
        }

        if (pixTransacao && pixTransacao.contribuicao_id) {
          const hoje = new Date().toISOString().slice(0, 10);
          db.prepare("UPDATE contribuicoes SET status = 'Pago', data_pagamento = ? WHERE id = ?").run(hoje, pixTransacao.contribuicao_id);
          console.log(`MP: Pagamento confirmado para contribuição #${pixTransacao.contribuicao_id}`);
        }
      }
    } catch (err) {
      console.error('MP: Erro ao processar webhook:', err.message);
    }

    return { status: 200, response: 'OK' };
  }
};

module.exports = MercadoPagoService;
