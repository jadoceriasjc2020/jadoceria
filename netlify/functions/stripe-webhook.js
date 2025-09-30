const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fetch = require('node-fetch');

// Função para atualizar o papel (role) do utilizador na Netlify
const updateUserRole = async (userId, action) => {
  // CORREÇÃO FINAL: Este é o URL correto para a API interna da Netlify
  const url = `${process.env.URL}/.netlify/identity/admin/users/${userId}`;
  const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;

  if (!adminToken) {
    throw new Error('Token de admin da Netlify não configurado.');
  }

  // Define os papéis (roles) a serem aplicados. Se for 'remove', o array fica vazio.
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
    // Melhoramos a mensagem de erro para nos dar mais detalhes
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
      // Para revogar o acesso, precisaríamos do ID do utilizador da Netlify.
      // O Stripe não nos dá isso diretamente aqui, mas poderíamos encontrá-lo
      // a partir do `subscription.customer` (ID do cliente no Stripe).
      // Por agora, vamos apenas registar o evento.
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

