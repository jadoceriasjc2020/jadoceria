// Importações necessárias
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

// --- Início da Função Handler ---
exports.handler = async ({ body, headers }) => {
  // LOG 1: Confirma que a versão mais recente da função foi executada.
  // Se esta mensagem não aparecer nos logs, o deploy não funcionou.
  console.log('--- EXECUTANDO WEBHOOK vFINAL (com JWT e Logs Detalhados) ---');

  try {
    // --- VERIFICAÇÃO DAS VARIÁVEIS DE AMBIENTE ---
    const siteUrl = process.env.SITE_URL;
    const jwtSecret = process.env.JWT_SECRET;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!siteUrl || !jwtSecret || !stripeWebhookSecret) {
      console.error('ERRO CRÍTICO DE CONFIGURAÇÃO: Uma ou mais variáveis de ambiente estão em falta.');
      console.error(`SITE_URL existe? ${!!siteUrl}`);
      console.error(`JWT_SECRET existe? ${!!jwtSecret}`);
      console.error(`STRIPE_WEBHOOK_SECRET existe? ${!!stripeWebhookSecret}`);
      return { statusCode: 500, body: 'Erro de configuração do servidor.' };
    }
    
    // LOG 2: Confirma que as variáveis de ambiente foram lidas.
    console.log('Variáveis de ambiente carregadas com sucesso.');

    // --- VALIDAÇÃO DO EVENTO STRIPE ---
    const stripeEvent = stripe.webhooks.constructEvent(
      body,
      headers['stripe-signature'],
      stripeWebhookSecret
    );
    
    // LOG 3: Confirma que o evento do Stripe é válido.
    console.log(`Evento Stripe validado com sucesso: ${stripeEvent.type}`);

    // --- PROCESSAMENTO DO EVENTO ---
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const netlifyUserId = session.client_reference_id;

      if (!netlifyUserId) {
        console.error('ERRO: Evento "checkout.session.completed" recebido sem client_reference_id.');
        return { statusCode: 400, body: 'Webhook Error: client_reference_id em falta.' };
      }

      // LOG 4: Temos o ID do utilizador.
      console.log(`Utilizador a ser atualizado: ${netlifyUserId}`);

      // --- GERAÇÃO DO TOKEN DE ADMIN ---
      let adminToken;
      try {
        const payload = {
          exp: Math.floor(Date.now() / 1000) + 60, // Expira em 60 segundos
          iat: Math.floor(Date.now() / 1000),
          server_role: 'admin',
        };
        adminToken = jwt.sign(payload, jwtSecret);
        // LOG 5: Token de admin gerado.
        console.log('Token de admin JWT gerado com sucesso.');
      } catch (jwtError) {
        console.error('ERRO GRAVE ao gerar o token JWT:', jwtError.message);
        throw new Error('Falha na geração do token de autenticação do admin.');
      }

      // --- CHAMADA À API DO NETLIFY IDENTITY ADMIN ---
      const url = `${siteUrl}/.netlify/identity/admin/users/${netlifyUserId}`;
      const userData = {
        app_metadata: {
          roles: ['premium'],
        },
      };

      // LOG 6: Preparando para chamar a API final.
      console.log(`A enviar pedido PUT para: ${url}`);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      // --- ANÁLISE DA RESPOSTA ---
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`ERRO da API do Netlify Identity Admin (Status: ${response.status}):`, errorBody);
        // Lança um erro para ser apanhado pelo catch principal e retornar um 400 para o Stripe.
        throw new Error(`A API do Identity respondeu com status ${response.status}`);
      }

      const responseData = await response.json();
      
      // LOG 7: SUCESSO!
      console.log('SUCESSO! Utilizador atualizado na Netlify.', responseData);
    
    } else {
      console.log(`Evento do tipo "${stripeEvent.type}" recebido, nenhuma ação necessária.`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };

  } catch (err) {
    // LOG DE ERRO GERAL
    console.error(`FALHA GERAL NO WEBHOOK: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }
};

