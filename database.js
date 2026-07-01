const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = path.resolve(__dirname, process.env.DB_PATH || './database.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nome TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS moradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT,
      lote TEXT NOT NULL,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contribuicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      morador_id INTEGER NOT NULL,
      valor REAL DEFAULT 100,
      mes_referencia TEXT NOT NULL,
      data_pagamento DATE,
      status TEXT DEFAULT 'Pendente',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (morador_id) REFERENCES moradores(id)
    );

    CREATE TABLE IF NOT EXISTS entradas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data DATE NOT NULL,
      categoria TEXT DEFAULT 'Outras',
      observacoes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data DATE NOT NULL,
      categoria TEXT DEFAULT 'Outras',
      observacoes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pix_transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contribuicao_id INTEGER,
      identificador TEXT NOT NULL,
      payload TEXT,
      valor REAL DEFAULT 0,
      status TEXT DEFAULT 'gerado',
      webhook_recebido INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contribuicao_id) REFERENCES contribuicoes(id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      de TEXT,
      para TEXT,
      mensagem TEXT,
      tipo TEXT DEFAULT 'text',
      origem TEXT DEFAULT 'enviada',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS whatsapp_contatos (
      chat_id TEXT PRIMARY KEY,
      morador_id INTEGER NOT NULL,
      telefone TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (morador_id) REFERENCES moradores(id)
    );
  `);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const senhaHash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, nome) VALUES (?, ?, ?)').run('admin', senhaHash, 'Administrador');
    console.log('Usuário padrão criado: admin / admin123');
  }
}

initDatabase();

module.exports = db;
