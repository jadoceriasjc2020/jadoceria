const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

// Função para gerar um token de administrador para o serviço Netlify Identity
const generateAdminToken = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('A variável de ambiente JWT_SECRET não está definida. É essencial para a autenticação.');
  }
  // Este token dá à nossa função o poder de "admin" sobre os usuários do Identity
  const payload = {
    exp: Math.floor(Date.now() / 1000) + (60), // Expira em 60 segundos
    iat: Math.floor(Date.now() / 1000),
    server_role: 'admin', // A "magia" está aqui
  };
  return jwt.sign(payload, secret);
};

// Função para atualizar o papel (role) do utilizador na Netlify
const updateUserRole = async (userId) => {
  try {
    const adminToken = generateAdminToken();
    const siteUrl = process.env.SITE_URL;

    if (!siteUrl) {
      throw new Error('A variável de ambiente SITE_URL não está definida.');
    }

    // ESTA É A MUDANÇA CRUCIAL:
    // Estamos a comunicar diretamente com a API de administração do Identity
    // do SEU site, em vez da API pública geral da Netlify.
    // É o caminho mais direto e fiável.
    const url = `${siteUrl}/.netlify/identity/admin/users/${userId}`;

    console.log(`--- A TENTAR ATUALIZAR O UTILIZADOR: ${userId} ---`);
    console.log(`URL do Admin Identity: ${url}`);

    const body = {
      app_metadata: {
        roles: ['premium'],
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
      console.error('Resposta de erro da API do Netlify Identity Admin:', errorData);
      throw new Error(`Falha ao atualizar o utilizador: Status ${response.status} - ${errorData}`);
    }
    
    const responseData = await response.json();
    console.log('Utilizador atualizado com sucesso!', responseData);
    return responseData;

  } catch (error) {
    console.error("Erro dentro da função updateUserRole:", error.message);
    // Propaga o erro para ser apanhado pelo handler principal
    throw error;
  }
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
        console.log(`SUCESSO FINAL: Acesso premium concedido ao utilizador: ${netlifyUserId}`);
      } else {
        console.error('ERRO CRÍTICO: checkout.session.completed recebido sem client_reference_id.');
        // Retornar 400 para que o Stripe saiba que algo está errado com este evento específico
        return { statusCode: 400, body: 'Webhook Error: client_reference_id em falta no evento do Stripe.' };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error(`Webhook do Stripe falhou de forma geral: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }
};

