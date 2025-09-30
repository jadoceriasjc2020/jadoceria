const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fetch = require('node-fetch');

// Função para atualizar o papel (role) do utilizador na Netlify
const updateUserRole = async (userId, action) => {
  const url = `https://api.netlify.com/api/v1/admin/users/${userId}`;
  const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;

  if (!adminToken) {
    throw new Error('Token de admin da Netlify não configurado.');
  }

  const currentRoles = action === 'add' ? ['premium'] : [];

  const body = {
    app_metadata: {
      roles: currentRoles,
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
    throw new Error(`Falha ao atualizar o utilizador na Netlify: ${errorData}`);
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

    // Lida com o evento de pagamento bem-sucedido
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      netlifyUserId = session.client_reference_id;
      if (netlifyUserId) {
        await updateUserRole(netlifyUserId, 'add');
        console.log(`Acesso premium concedido ao utilizador: ${netlifyUserId}`);
      }
    }

    // Lida com o evento de cancelamento/fim de assinatura
    if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object;
      // Para revogar o acesso, seria necessário encontrar o netlifyUserId associado a esta subscrição
      // e chamar updateUserRole(netlifyUserId, 'remove');
      console.log(`Assinatura cancelada: ${subscription.id}`);
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

