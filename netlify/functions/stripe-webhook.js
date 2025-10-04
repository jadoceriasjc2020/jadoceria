// Usaremos o node-fetch, que já está no seu package.json
const fetch = require('node-fetch');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Função para dormir por um período de tempo
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função que tenta atualizar o utilizador com retentativas
const updateUserWithRetry = async (userId, token, maxRetries = 3, delay = 3000) => {
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!siteId) {
      throw new Error("ERRO CRÍTICO: NETLIFY_SITE_ID não está configurado.");
  }

  // A URL que faz mais sentido lógico: específica para o site.
  const url = `https://api.netlify.com/api/v1/sites/${siteId}/users/${userId}`;
  const userData = { app_metadata: { roles: ['premium'] } };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`--- Tentativa ${attempt} de ${maxRetries} ---`);
    console.log(`A enviar pedido PUT para: ${url}`);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (response.ok) {
      console.log('SUCESSO! Utilizador atualizado.');
      return await response.json(); // Sucesso, retorna a resposta
    }

    // Se for 404 e ainda tivermos tentativas, espera e tenta de novo
    if (response.status === 404 && attempt < maxRetries) {
      console.warn(`API retornou 404 (Not Found). O utilizador pode ainda não ter propagado. A aguardar ${delay / 1000}s...`);
      await sleep(delay);
    } else {
      // Se for outro erro ou a última tentativa, falha de vez
      const errorBody = await response.text();
      console.error(`ERRO da API da Netlify (Status: ${response.status}):`, errorBody);
      throw new Error(`A API da Netlify respondeu com status ${response.status}`);
    }
  }
};

exports.handler = async ({ body, headers }) => {
  console.log('--- EXECUTANDO WEBHOOK vFINAL (com Retentativa Inteligente) ---');

  try {
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
        throw new Error('client_reference_id não encontrado na sessão do Stripe.');
      }
      console.log(`Utilizador a ser atualizado: ${netlifyUserId}`);

      const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;
      if (!adminToken) {
        throw new Error('NETLIFY_ADMIN_AUTH_TOKEN não está configurado.');
      }
      
      // Chama a nossa nova função com lógica de retentativa
      await updateUserWithRetry(netlifyUserId, adminToken);
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

