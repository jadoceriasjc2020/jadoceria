// Usaremos o node-fetch, que já está no seu package.json
const fetch = require('node-fetch');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async ({ body, headers }) => {
  console.log('--- EXECUTANDO WEBHOOK vFINAL (para Identity Deprecated com Atraso) ---');

  try {
    // 1. Validar o evento do Stripe
    const stripeEvent = stripe.webhooks.constructEvent(
      body,
      headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log(`Evento Stripe validado: ${stripeEvent.type}`);

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const netlifyUserId = session.client_reference_id;

      if (!netlifyUserId) {
        console.error('ERRO: client_reference_id não encontrado na sessão do Stripe.');
        return { statusCode: 400, body: 'Webhook Error: client_reference_id em falta.' };
      }
      console.log(`Utilizador a ser atualizado: ${netlifyUserId}`);

      // 2. Montar a requisição para a API correta
      const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;
      if (!adminToken) {
        console.error('ERRO CRÍTICO: NETLIFY_ADMIN_AUTH_TOKEN não está configurado.');
        return { statusCode: 500, body: 'Erro de configuração do servidor.' };
      }
      
      // A URL correta para a versão antiga do Identity!
      const url = `https://api.netlify.com/api/v1/users/${netlifyUserId}`;
      
      const userData = {
        app_metadata: {
          roles: ['premium'],
        },
      };

      // --- O ATRASO ESTRATÉGICO ---
      console.log('Aguardando 5 segundos para permitir a propagação do utilizador na Netlify...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('Aguardamento concluído. A tentar a atualização...');
      
      console.log(`A enviar pedido PUT para a API principal: ${url}`);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      // 3. Analisar a resposta
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`ERRO da API da Netlify (Status: ${response.status}):`, errorBody);
        throw new Error(`A API da Netlify respondeu com status ${response.status}`);
      }

      const responseData = await response.json();
      console.log('SUCESSO! Utilizador atualizado via API principal.', responseData);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };

  } catch (err) {
    console.error(`FALHA GERAL NO WEBHOOK: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }
};

