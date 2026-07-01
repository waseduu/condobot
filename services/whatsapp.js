const { Client, LocalAuth, Buttons } = require('whatsapp-web.js');
const path = require('path');
const db = require('../database');
const PIXService = require('./pix');

const SESSION_DIR = path.join(__dirname, '..', 'wpp_session');

let client = null;
let clientStatus = 'desconectado';
let currentQrCode = null;
let qrCodeGeneratedAt = null;
let reconnectTimer = null;

const BOT_STATE = {};

const WhatsAppService = {
  getStatus() {
    return {
      status: clientStatus,
      qrCode: currentQrCode,
      qrCodeGeneratedAt,
      connected: clientStatus === 'conectado'
    };
  },

  async iniciar() {
    if (client) return;

    const puppeteerOpts = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    const fs = require('fs');
    const caminhosChrome = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable'
    ];
    for (const p of caminhosChrome) {
      try {
        if (fs.existsSync(p)) {
          puppeteerOpts.executablePath = p;
          break;
        }
      } catch (e) { /* ignora */ }
    }
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
      puppeteer: puppeteerOpts
    });

    client.on('qr', (qr) => {
      clientStatus = 'escaneie_o_qr';
      currentQrCode = qr;
      qrCodeGeneratedAt = new Date().toISOString();
      console.log('WhatsApp: QR Code gerado. Escaneie com o celular.');
    });

    client.on('ready', () => {
      clientStatus = 'conectado';
      currentQrCode = null;
      console.log('WhatsApp: Conectado com sucesso!');
    });

    client.on('disconnected', (reason) => {
      clientStatus = 'desconectado';
      console.log('WhatsApp: Desconectado:', reason);
      this._agendarReconexao();
    });

    client.on('message', async (msg) => {
      const from = msg.from || msg.author || 'desconhecido';
      if (from === 'status@broadcast') return;
      if (from.includes('@g.us')) return;

      const text = (msg.body || '').trim();
      let telefone = '';

      try {
        const contact = await msg.getContact();
        telefone = contact.number || contact.id?.user || '';
        console.log(`WhatsApp contato: ${telefone} (${from})`);
      } catch (e) {
        telefone = from.replace('@c.us', '').replace('@lid', '').replace('@broadcast', '');
        console.log(`WhatsApp contato (fallback): ${telefone}`);
      }

      db.prepare(`
        INSERT INTO whatsapp_mensagens (de, mensagem, tipo, origem)
        VALUES (?, ?, ?, 'recebida')
      `).run(from, text, 'text');

      await this._processarBot(from, telefone, text);
    });

    client.on('message_ack', (msg, ack) => {
      if (ack >= 2) {
        db.prepare(`
          INSERT INTO whatsapp_mensagens (para, mensagem, tipo, origem)
          VALUES (?, ?, ?, 'entregue')
        `).run(msg.to || msg.from, msg.body || '', 'text');
      }
    });

    try {
      await client.initialize();
    } catch (err) {
      console.error('WhatsApp: Erro ao inicializar:', err.message);
      clientStatus = 'erro';
      this._agendarReconexao();
    }
  },

  async _processarBot(from, telefone, text) {
    let morador = null;
    const chatContato = db.prepare('SELECT morador_id FROM whatsapp_contatos WHERE chat_id = ?').get(from);
    if (chatContato) {
      morador = db.prepare('SELECT id, nome, lote FROM moradores WHERE id = ? AND ativo = 1').get(chatContato.morador_id);
    }

    if (!morador) {
      const digitos = (telefone || from).replace(/\D/g, '').slice(-11);
      if (digitos) {
        morador = db.prepare(`
          SELECT id, nome, lote FROM moradores
          WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?
          AND ativo = 1
        `).get(`%${digitos}%`);
        if (morador) {
          this._salvarContato(from, morador.id, digitos);
        }
      }
    }

    const stateKey = `${from}`;

    if (!morador) {
      const estado = BOT_STATE[stateKey] || 'cadastro_inicio';
      if (text === '0' || text.toLowerCase() === 'sair' || text.toLowerCase() === 'cancelar') {
        delete BOT_STATE[stateKey];
        await this.sendMessage(from, 'Cadastro cancelado. Digite *MENU* quando quiser tentar novamente.');
        return;
      }
      if (estado === 'cadastro_inicio') {
        BOT_STATE[stateKey] = 'cadastro_nome';
        await this.sendMessage(from, '👋 Bem-vindo ao CondoBot!\n\nVou fazer seu cadastro rapidinho.\n\nDigite seu *nome completo*:');
        return;
      }
      if (estado === 'cadastro_nome') {
        BOT_STATE[stateKey] = 'cadastro_telefone';
        BOT_STATE[`${stateKey}_nome`] = text;
        await this.sendMessage(from, `Ótimo! Agora digite seu *telefone* com DDD (ex: 71999999999):`);
        return;
      }
      if (estado === 'cadastro_telefone') {
        BOT_STATE[stateKey] = 'cadastro_lote';
        BOT_STATE[`${stateKey}_telefone`] = text.replace(/\D/g, '');
        await this.sendMessage(from, `Perfeito! Por último, digite o número do seu *lote*:`);
        return;
      }
      if (estado === 'cadastro_lote') {
        const nome = BOT_STATE[`${stateKey}_nome`];
        const telefone = BOT_STATE[`${stateKey}_telefone`];
        const lote = text.trim();
        try {
          const result = db.prepare(`
            INSERT INTO moradores (nome, telefone, lote, ativo)
            VALUES (?, ?, ?, 1)
          `).run(nome, telefone, lote);
          const moradorId = result.lastInsertRowid;
          this._salvarContato(from, moradorId, telefone);
          const mes = new Date().toISOString().slice(0, 7);
          db.prepare(`
            INSERT INTO contribuicoes (morador_id, valor, mes_referencia, status)
            VALUES (?, 100, ?, 'Pendente')
          `).run(moradorId, mes);
          delete BOT_STATE[stateKey];
          delete BOT_STATE[`${stateKey}_nome`];
          delete BOT_STATE[`${stateKey}_telefone`];
          await this.sendMessage(from, `✅ *Cadastro concluído com sucesso!*\n\nSeus dados:\nNome: ${nome}\nTelefone: ${telefone}\nLote: ${lote}\n\nSua contribuição de R$ 100,00 deste mês já foi gerada. Digite *MENU* para acessar as opções.`);
        } catch (err) {
          await this.sendMessage(from, '❌ Erro ao cadastrar. Tente novamente digitando *MENU*.');
          delete BOT_STATE[stateKey];
        }
        return;
      }
      return;
    }

    const estado = BOT_STATE[stateKey] || 'menu';

    if (text === '0' || text.toLowerCase() === 'sair' || text.toLowerCase() === 'menu') {
      BOT_STATE[stateKey] = 'menu';
      await this._enviarMenu(from, morador);
      return;
    }

    if (estado === 'menu') {
      switch (text) {
        case '1':
          await this._verDebitos(from, morador);
          break;
        case '2':
          await this._gerarPixResposta(from, morador);
          break;
        case '3':
          BOT_STATE[stateKey] = 'aguardando_mensagem';
          await this.sendMessage(from, '✉️ *Falar com Administrador*\n\nDigite sua mensagem que enviaremos para a administração.');
          break;
        case '4':
          await this._extratoContribuicoes(from, morador);
          break;
        default:
          await this._enviarMenu(from, morador);
      }
    } else if (estado === 'aguardando_mensagem') {
      BOT_STATE[stateKey] = 'menu';
      db.prepare(`
        INSERT INTO whatsapp_mensagens (de, mensagem, tipo, origem)
        VALUES (?, ?, ?, 'mensagem_admin')
      `).run(from, `[${morador.nome} - Lote ${morador.lote}]: ${text}`, 'text');
      await this.sendMessage(from, '✅ Mensagem enviada para administração. Em breve responderemos.');
      await this._enviarMenu(from, morador);
    }
  },

  async _enviarMenu(from, morador) {
    const botoes = new Buttons(
      `Olá ${morador.nome}! Escolha uma opção:`,
      [
        { body: '1️⃣ Ver débitos', id: '1' },
        { body: '2️⃣ Gerar PIX', id: '2' },
        { body: '3️⃣ Falar com admin', id: '3' },
        { body: '4️⃣ Extrato', id: '4' },
        { body: '0️⃣ Sair', id: '0' }
      ],
      '🤖 CondoBot - Assistente Virtual',
      'Clique em uma opção acima ou digite o número'
    );
    try {
      await client.sendMessage(from, botoes);
    } catch (e) {
      const menu = [
        `🤖 *CondoBot - Assistente Virtual*`,
        ``,
        `Olá ${morador.nome}! Escolha uma opção:`,
        ``,
        `1️⃣ - Ver débitos pendentes`,
        `2️⃣ - Gerar PIX para pagamento`,
        `3️⃣ - Falar com administrador`,
        `4️⃣ - Extrato de contribuições`,
        `0️⃣ - Sair`,
        ``,
        `Digite o número da opção desejada.`
      ].join('\n');
      await this.sendMessage(from, menu);
    }
  },

  async _verDebitos(from, morador) {
    const debitos = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(valor), 0) as totalValor
      FROM contribuicoes WHERE morador_id = ? AND status = 'Pendente'
    `).get(morador.id);

    const mensagem = [
      `📋 *Débitos Pendentes*`,
      ``,
      `Olá ${morador.nome}!`,
      `Você tem *${debitos.total}* contribuição(ões) pendente(s).`,
      `Valor total: *R$ ${debitos.totalValor.toFixed(2)}*`,
      ``,
      `Digite *2* para gerar um PIX ou *0* para voltar ao menu.`
    ].join('\n');
    await this.sendMessage(from, mensagem);
  },

  async _gerarPixResposta(from, morador) {
    try {
      const contrib = db.prepare(`
        SELECT id, valor, mes_referencia FROM contribuicoes
        WHERE morador_id = ? AND status = 'Pendente'
        ORDER BY mes_referencia ASC LIMIT 1
      `).get(morador.id);

      if (!contrib) {
        await this.sendMessage(from, '✅ Você não tem débitos pendentes!');
        await this._enviarMenu(from, morador);
        return;
      }

      if (!PIXService.isConfigured()) {
        await this.sendMessage(from, '❌ PIX ainda não configurado pela administração.');
        return;
      }

      const pixData = PIXService.gerarQRCodeConta(contrib.id);
      const mensagem = [
        `💳 *PIX para Pagamento*`,
        ``,
        `Contribuição: ${contrib.mes_referencia}`,
        `Valor: R$ ${contrib.valor.toFixed(2)}`,
        ``,
        `*Código PIX Copia e Cola:*`,
        `${pixData.payload}`,
        ``,
        `Abra o banco, escolha PIX Copia e Cola e cole o código acima.`,
        ``,
        `Digite *0* para voltar ao menu.`
      ].join('\n');
      await this.sendMessage(from, mensagem);
    } catch (err) {
      await this.sendMessage(from, '❌ Erro ao gerar PIX. Tente novamente ou fale com administrador.');
    }
  },

  async _extratoContribuicoes(from, morador) {
    const contribs = db.prepare(`
      SELECT mes_referencia, valor, status, data_pagamento
      FROM contribuicoes WHERE morador_id = ?
      ORDER BY mes_referencia DESC LIMIT 6
    `).all(morador.id);

    let extrato = `📊 *Extrato de Contribuições*\n\nOlá ${morador.nome}!\n\n`;
    if (contribs.length === 0) {
      extrato += 'Nenhuma contribuição registrada.';
    } else {
      contribs.forEach(c => {
        const status = c.status === 'Pago' ? '✅' : '⏳';
        extrato += `${status} ${c.mes_referencia} - R$${c.valor.toFixed(2)} - ${c.status}\n`;
      });
    }
    extrato += `\nDigite *0* para voltar ao menu.`;
    await this.sendMessage(from, extrato);
  },

  _agendarReconexao() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      console.log('WhatsApp: Tentando reconectar...');
      client = null;
      this.iniciar();
    }, 30000);
  },

  async desconectar() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (client) {
      try { await client.destroy(); } catch (e) { /* ignorar */ }
      client = null;
    }
    clientStatus = 'desconectado';
    currentQrCode = null;
    const fs = require('fs');
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
  },

  _salvarContato(chatId, moradorId, telefone) {
    db.prepare(`
      INSERT OR REPLACE INTO whatsapp_contatos (chat_id, morador_id, telefone, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(chatId, moradorId, telefone);
  },

  async sendMessage(para, mensagem, moradorId) {
    if (!client || clientStatus !== 'conectado') {
      throw new Error('WhatsApp não está conectado.');
    }
    let chatId = para;
    if (!chatId.includes('@')) {
      chatId = `${chatId}@c.us`;
    }
    try {
      if (!chatId.includes('@lid') && !chatId.includes('@g.us')) {
        const numberPart = chatId.split('@')[0];
        try {
          const numberExists = await client.getNumberId(numberPart);
          if (numberExists) {
            chatId = numberExists._serialized || `${numberPart}@c.us`;
          }
        } catch (e) {
          // continua com o chatId original
        }
      }
      const response = await client.sendMessage(chatId, mensagem);
      try {
        db.prepare(`
          INSERT INTO whatsapp_mensagens (para, mensagem, tipo, origem)
          VALUES (?, ?, ?, 'enviada')
        `).run(chatId, mensagem, 'text');
      } catch (dbErr) {
        console.error('Erro ao salvar mensagem enviada:', dbErr.message);
      }
      if (moradorId) {
        try {
          this._salvarContato(chatId, moradorId, chatId);
        } catch (dbErr) {
          console.error('Erro ao salvar contato:', dbErr.message);
        }
      }
      return { response, chatId };
    } catch (err) {
      const errorMsg = err.message || 'Erro desconhecido';
      try {
        db.prepare(`
          INSERT INTO whatsapp_mensagens (para, mensagem, tipo, origem)
          VALUES (?, ?, ?, 'erro')
        `).run(chatId, `Falha: ${errorMsg}`, 'text');
      } catch (dbErr) {
        console.error('Erro ao salvar erro:', dbErr.message);
      }
      throw new Error(`Falha ao enviar mensagem`);
    }
  },

  formatarTelefone(telefone) {
    let num = telefone.replace(/\D/g, '');
    if (!num.startsWith('55')) num = '55' + num;
    if (num.length === 12) {
      num = num.slice(0, 4) + '9' + num.slice(4);
    }
    return num;
  },

  async sendLembretePagamento(morador, contribuicao) {
    let pixTexto = '';
    try {
      if (PIXService.isConfigured()) {
        const pixData = PIXService.gerarQRCodeConta(contribuicao.id);
        pixTexto = `\n💳 *PIX Copia e Cola:*\n${pixData.payload}\n`;
      }
    } catch (e) { /* PIX não configurado */ }

    const mensagem = [
      `*CondoBot - Lembrete de Contribuição*`,
      ``,
      `Olá ${morador.nome}!`,
      `Sua contribuição do mês *${contribuicao.mes_referencia}* no valor de *R$ ${contribuicao.valor.toFixed(2)}* ainda está pendente.`,
      pixTexto,
      ``,
      `Para mais opções, responda *MENU* a qualquer momento.`,
      `Agradecemos pela contribuição!`
    ].join('\n');

    const telefone = this.formatarTelefone(morador.telefone);
    return this.sendMessage(telefone, mensagem, morador.id);
  },

  async sendComprovante(morador, contribuicao) {
    const mensagem = [
      `*CondoBot - Comprovante de Pagamento*`,
      ``,
      `Olá ${morador.nome}!`,
      `Recebemos sua contribuição do mês *${contribuicao.mes_referencia}* no valor de *R$ ${contribuicao.valor.toFixed(2)}*.`,
      `Data do pagamento: ${contribuicao.data_pagamento}`,
      ``,
      `Obrigado por contribuir com nossa associação!`
    ].join('\n');

    const telefone = this.formatarTelefone(morador.telefone);
    return this.sendMessage(telefone, mensagem, morador.id);
  },

  getContatos() {
    return db.prepare(`
      SELECT wc.*, m.nome, m.lote, m.telefone as morador_telefone
      FROM whatsapp_contatos wc
      LEFT JOIN moradores m ON m.id = wc.morador_id
      ORDER BY wc.updated_at DESC
    `).all();
  },

  getMensagens(limit = 20) {
    return db.prepare(`
      SELECT * FROM whatsapp_mensagens
      WHERE de IS NULL OR de NOT IN ('status@broadcast')
      ORDER BY id DESC LIMIT ?
    `).all(limit);
  }
};

module.exports = WhatsAppService;
