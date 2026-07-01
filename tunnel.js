const localtunnel = require('localtunnel');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3000, subdomain: 'condobot' + Date.now().toString(36) });
    console.log('\n══════════════════════════════════════');
    console.log('  CondoBot público em:');
    console.log(`  ${tunnel.url}`);
    console.log('══════════════════════════════════════');
    console.log('  Compartilhe esse link pra testar!');
    console.log('  Webhook Mercado Pago:');
    console.log(`  ${tunnel.url}/integracoes/mercadopago/webhook`);
    console.log('══════════════════════════════════════\n');

    tunnel.on('close', () => {
      console.log('Tunnel fechado');
      process.exit();
    });
  } catch (err) {
    console.error('Erro:', err.message);
  }
})();
