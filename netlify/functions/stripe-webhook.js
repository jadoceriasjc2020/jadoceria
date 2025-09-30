const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fetch = require('node-fetch');

// Função para atualizar o papel (role) do utilizador na Netlify
const updateUserRole = async (userId, action) => {
  const siteId = process.env.NETLIFY_SITE_ID;
  const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;

  // --- NOSSO RAIO-X FINAL ---
  console.log('--- DADOS PARA ATUALIZAÇÃO DO UTILIZADOR ---');
  console.log(`SITE ID A SER USADO: ${siteId}`);
  console.log(`USER ID A SER ATUALIZADO: ${userId}`);
  console.log(`TOKEN ADMIN USADO (primeiros 4 chars): ${adminToken ? adminToken.substring(0, 4) : 'NÃO ENCONTRADO'}`);
  // -------------------------

  const url = `https://api.netlify.com/api/v1/sites/${siteId}/users/${userId}`;

  if (!adminToken || !siteId) {
    console.error('ERRO CRÍTICO: Variáveis de ambiente em falta.', { hasAdminToken: !!adminToken, hasSiteId: !!siteId });
    throw new Error('As variáveis NETLIFY_ADMIN_AUTH_TOKEN e NETLIFY_SITE_ID são obrigatórias.');
  }

  const roles = action === 'add' ? ['premium'] : [];
  const body = { app_metadata: { roles: roles } };

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Resposta de erro da API da Netlify:', errorData);
    throw new Error(`Falha ao atualizar o utilizador na Netlify: Status ${response.status} - ${errorData}`);
  }

  return response.json();
};

exports.handler = async ({ body, headers }) => {
  try {
    const stripeEvent = stripe.webhooks.constructEvent(
      body,
      headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );

    let netlifyUserId;

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      netlifyUserId = session.client_reference_id;
      if (netlifyUserId) {
        await updateUserRole(netlifyUserId, 'add');
        console.log(`Acesso premium concedido ao utilizador: ${netlifyUserId}`);
      } else {
        console.error('ERRO: checkout.session.completed recebido sem client_reference_id.');
      }
    }

    if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object;
      console.log(`Assinatura cancelada: ${subscription.id}. Acesso a ser revogado manualmente por enquanto.`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error(`Stripe webhook failed: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }
};

