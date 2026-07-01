const db = require('../database');
const crypto = require('crypto');

const CONFIG_KEYS = {
  PIX_CHAVE: 'pix_chave',
  PIX_NOME: 'pix_nome',
  PIX_CIDADE: 'pix_cidade',
  PIX_WEBHOOK_SECRET: 'pix_webhook_secret'
};

function getConfig(key) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(key);
  return row ? row.valor : null;
}

function setConfig(key, valor) {
  db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run(key, valor);
}

const PIXService = {
  getConfigs() {
    const configs = {};
    for (const key of Object.values(CONFIG_KEYS)) {
      configs[key] = getConfig(key) || '';
    }
    return configs;
  },

  saveConfigs(data) {
    for (const [key, value] of Object.entries(data)) {
      if (Object.values(CONFIG_KEYS).includes(key)) {
        setConfig(key, value);
      }
    }
  },

  isConfigured() {
    return !!(getConfig(CONFIG_KEYS.PIX_CHAVE) && getConfig(CONFIG_KEYS.PIX_NOME));
  },

  _crc16(payload) {
    const polinomio = 0x1021;
    let resultado = 0xFFFF;
    const bytes = Buffer.from(payload, 'utf8');
    for (const byte of bytes) {
      resultado ^= (byte << 8);
      for (let i = 0; i < 8; i++) {
        if (resultado & 0x8000) {
          resultado = (resultado << 1) ^ polinomio;
        } else {
          resultado = (resultado << 1);
        }
        resultado &= 0xFFFF;
      }
    }
    return (resultado & 0xFFFF).toString(16).toUpperCase();
  },

  _addField(id, value) {
    const size = String(value.length).padStart(2, '0');
    return `${id}${size}${value}`;
  },

  generatePayload(contribuicaoId, valor, descricao) {
    const chave = getConfig(CONFIG_KEYS.PIX_CHAVE);
    const nome = getConfig(CONFIG_KEYS.PIX_NOME);
    const cidade = getConfig(CONFIG_KEYS.PIX_CIDADE) || 'CIDADE';

    if (!chave || !nome) {
      throw new Error('PIX não configurado');
    }

    const identificador = `CONDO${String(contribuicaoId).padStart(6, '0')}`;
    const desc = (descricao || `Contribuicao #${contribuicaoId}`).substring(0, 40);

    const merchantAccountInfo = this._addField('00', 'br.gov.bcb.pix') +
      this._addField('01', chave);

    const additionalData = this._addField('05', identificador);

    let payload = this._addField('00', '01') +
      this._addField('26', merchantAccountInfo) +
      this._addField('52', '0000') +
      this._addField('53', '986') +
      this._addField('54', valor.toFixed(2)) +
      this._addField('58', 'BR') +
      this._addField('59', nome.substring(0, 25)) +
      this._addField('60', cidade.substring(0, 15)) +
      this._addField('62', additionalData);

    const crc = this._crc16(payload + '6304');
    payload += `6304${crc}`;

    return {
      payload,
      identificador,
      valor,
      chave,
      nome,
      cidade,
      crc
    };
  },

  gerarQRCodeConta(contribuicaoId) {
    const contrib = db.prepare('SELECT * FROM contribuicoes WHERE id = ?').get(contribuicaoId);
    if (!contrib) throw new Error('Contribuição não encontrada');

    const pixData = this.generatePayload(contribuicaoId, contrib.valor, `Contribuicao ${contrib.mes_referencia}`);

    db.prepare(`
      INSERT INTO pix_transacoes (contribuicao_id, identificador, payload, valor, status)
      VALUES (?, ?, ?, ?, 'gerado')
    `).run(contribuicaoId, pixData.identificador, pixData.payload, contrib.valor);

    return pixData;
  },

  handleWebhook(reqBody, reqHeaders) {
    const webhookSecret = getConfig(CONFIG_KEYS.PIX_WEBHOOK_SECRET);

    if (webhookSecret) {
      const signature = reqHeaders['x-webhook-signature'];
      if (signature) {
        const hash = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(reqBody)).digest('hex');
        if (hash !== signature) {
          return { status: 401, response: 'Assinatura inválida' };
        }
      }
    }

    const transaction = reqBody;
    const identificador = transaction.identificador || transaction.txid || '';

    if (!identificador) {
      return { status: 400, response: 'Identificador não encontrado' };
    }

    const pixTransacao = db.prepare('SELECT * FROM pix_transacoes WHERE identificador = ? ORDER BY id DESC').get(identificador);

    if (!pixTransacao) {
      db.prepare(`
        INSERT INTO pix_transacoes (identificador, payload, valor, status, webhook_recebido)
        VALUES (?, ?, ?, ?, 1)
      `).run(identificador, JSON.stringify(transaction), transaction.valor || 0, 'recebido_webhook');

      return { status: 200, response: 'Webhook recebido, transação não encontrada no sistema' };
    }

    db.prepare("UPDATE pix_transacoes SET status = 'confirmado', webhook_recebido = 1 WHERE id = ?").run(pixTransacao.id);

    if (pixTransacao.contribuicao_id) {
      const hoje = new Date().toISOString().slice(0, 10);
      db.prepare("UPDATE contribuicoes SET status = 'Pago', data_pagamento = ? WHERE id = ?").run(hoje, pixTransacao.contribuicao_id);
    }

    return { status: 200, response: 'Pagamento confirmado' };
  },

  getTransacoes(limit = 50) {
    return db.prepare(`
      SELECT p.*, c.mes_referencia, m.nome as morador_nome, m.lote as morador_lote
      FROM pix_transacoes p
      LEFT JOIN contribuicoes c ON p.contribuicao_id = c.id
      LEFT JOIN moradores m ON c.morador_id = m.id
      ORDER BY p.id DESC
      LIMIT ?
    `).all(limit);
  }
};

module.exports = PIXService;
