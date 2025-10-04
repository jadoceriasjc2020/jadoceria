const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Usaremos o node-fetch para garantir a compatibilidade com o ambiente da Netlify.
// Certifique-se de que ele está no seu package.json!
const fetch = require('node-fetch');

// Função para atualizar o papel (role) do utilizador na Netlify
const updateUserRole = async (userId) => {
  const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;

  // --- LOG DE DEPURAÇÃO ---
  console.log('--- DADOS PARA ATUALIZAÇÃO DO UTILIZADOR ---');
  console.log(`USER ID A SER ATUALIZADO: ${userId}`);
  console.log(`TOKEN ADMIN USADO (primeiros 4 chars): ${adminToken ? adminToken.substring(0, 4) : 'NÃO ENCONTRADO'}`);
  // -------------------------

  // A MUDANÇA CRÍTICA ESTÁ AQUI!
  // Em vez de usar o endpoint que inclui o SITE ID, vamos usar o endpoint
  // direto do utilizador. Os utilizadores do Netlify Identity pertencem à sua conta
  // e o 'app_metadata' (onde as roles ficam) é parte do objeto principal do utilizador.
  // O erro 404 acontecia porque o utilizador não era encontrado *dentro* do contexto do site,
  // mas ele existe no contexto da sua conta. Este endpoint é o correto para esta operação.
  const url = `https://api.netlify.com/api/v1/users/${userId}`;
  
  if (!adminToken || !userId) {
    console.error('ERRO CRÍTICO: Variáveis de ambiente (TOKEN) ou User ID em falta.');
    throw new Error('O NETLIFY_ADMIN_AUTH_TOKEN e o userId são obrigatórios.');
  }

  // A API da Netlify para este endpoint funciona como um "PATCH".
  // Ela vai adicionar/atualizar o campo 'roles' dentro de 'app_metadata'
  // sem apagar outros dados que possam existir.
  const body = {
    app_metadata: {
      roles: ['premium']
    }
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.text(); // Usar .text() para ver a resposta completa
    console.error('Resposta de erro da API da Netlify:', errorData);
    throw new Error(`Falha ao atualizar o utilizador na Netlify: Status ${response.status} - ${errorData}`);
  }

  console.log('Utilizador atualizado com sucesso na Netlify!');
  return response.json();
};

exports.handler = async ({ body, headers }) => {
  try {
    const stripeEvent = stripe.webhooks.constructEvent(
      body,
      headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const netlifyUserId = session.client_reference_id;
      
      if (netlifyUserId) {
        console.log(`Evento 'checkout.session.completed' recebido para o utilizador: ${netlifyUserId}`);
        await updateUserRole(netlifyUserId);
        console.log(`SUCESSO: Acesso premium concedido ao utilizador: ${netlifyUserId}`);
      } else {
        console.error('ERRO: checkout.session.completed recebido sem client_reference_id.');
      }
    }

    // Opcional: Lidar com outros eventos, como cancelamentos.
    if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object;
      console.log(`Assinatura cancelada: ${subscription.id}. A lógica para remover o acesso precisa ser implementada aqui.`);
      // Aqui você chamaria updateUserRole(userId, 'remove') se tivesse o ID do utilizador.
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error(`Webhook do Stripe falhou: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }
};
