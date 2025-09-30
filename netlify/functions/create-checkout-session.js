const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { NetlifyJwtVerifier } = require('@serverless-jwt/netlify');

// Configuração do verificador JWT
const verifyJwt = NetlifyJwtVerifier({
  issuer: process.env.URL ? new URL(process.env.URL).origin : 'https://calculadorapro2025.netlify.app',
  audience: process.env.SITE_ID || 'calculadorapro2025.netlify.app'
});


exports.handler = async (event, context) => {
  // Verificação de segurança como primeiro passo dentro da função
  try {
    const claims = await verifyJwt(event);
    const user = claims.user;

    if (!user || !user.sub) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Utilizador não autenticado.' }),
      };
    }
    
    // O resto do código continua igual
    const { priceId, mode } = JSON.parse(event.body);

    if (!priceId || !mode) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'ID do Preço ou modo de pagamento em falta.' })
        };
    }

    if (mode !== 'subscription' && mode !== 'payment') {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Modo de pagamento inválido.' })
        };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode,
      success_url: `${process.env.SITE_URL}/calculadoradora.html`,
      cancel_url: `${process.env.SITE_URL}/calculadora.html`,
      client_reference_id: user.sub,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ redirect_url: session.url }),
    };

  } catch (error) {
    console.error('Erro na função de checkout:', {
        message: error.message,
        stack: error.stack,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Falha ao criar a sessão de pagamento. (${error.message})` }),
    };
  }
};

