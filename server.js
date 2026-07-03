process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err?.message || err);
});

const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'condobot_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const moradoresRoutes = require('./routes/moradores');
const contribuicoesRoutes = require('./routes/contribuicoes');
const financeiroRoutes = require('./routes/financeiro');
const relatoriosRoutes = require('./routes/relatorios');
const integracoesRoutes = require('./routes/integracoes');
const WhatsAppService = require('./services/whatsapp');

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/moradores', moradoresRoutes);
app.use('/contribuicoes', contribuicoesRoutes);
app.use('/financeiro', financeiroRoutes);
app.use('/relatorios', relatoriosRoutes);
app.use('/integracoes', integracoesRoutes);

app.get('/health', (req, res) => res.send('ok'));

app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.use((req, res) => {
  res.status(404).render('login', { error: 'Página não encontrada' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CondoBot rodando em http://0.0.0.0:${PORT}`);
  WhatsAppService.iniciar().catch(err => {
    console.error('Erro ao iniciar WhatsApp:', err.message);
  });
});
