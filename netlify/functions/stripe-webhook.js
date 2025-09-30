const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fetch = require('node-fetch');

// Função para atualizar o papel (role) do utilizador na Netlify
const updateUserRole = async (userId, action) => {
  const url = `${process.env.URL}/.netlify/identity/admin/users/${userId}`;
  const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;

  // LINHA DE DEBUG: Vamos verificar como a função está a ver o token.
  console.log(`DEBUG: Verificando o token. Comprimento: ${adminToken ? adminToken.length : 'N/A'}. Primeiros 4 chars: ${adminToken ? adminToken.substring(0, 4) : 'N/A'}`);

  if (!adminToken) {
    throw new Error('Token de admin da Netlify não configurado.');
  }

  const roles = action === 'add' ? ['premium'] : [];

  const body = {
    app_metadata: {
      roles: roles,
    },
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.text();
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

