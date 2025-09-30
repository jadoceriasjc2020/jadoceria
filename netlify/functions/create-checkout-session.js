const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { NetlifyJwtVerifier } = require('@serverless-jwt/netlify');

const verifyJwt = NetlifyJwtVerifier({
  issuer: `https://api.netlify.com/`,
  audience: 'https://api.netlify.com'
});

exports.handler = verifyJwt(async (event, context) => {
  try {
    const { claims } = context.identityContext;
    const { user } = claims;

    if (!user || !user.sub) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Utilizador não autenticado.' }),
      };
    }

    // Recebe o ID do preço e o modo (subscription ou payment) do front-end
    const { priceId, mode } = JSON.parse(event.body);

    if (!priceId || !mode) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'ID do Preço ou modo de pagamento em falta.' })
        };
    }

    // Valida o modo para segurança extra
    if (mode !== 'subscription' && mode !== 'payment') {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Modo de pagamento inválido.' })
        };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // Usa o ID do preço recebido do cliente
          quantity: 1,
        },
      ],
      mode: mode, // Usa o modo (subscription ou payment) recebido do cliente
      success_url: `${process.env.SITE_URL}/calculadora.html`,
      cancel_url: `${process.env.SITE_URL}/calculadora.html`,
      client_reference_id: user.sub, // ID do utilizador Netlify
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ redirect_url: session.url }),
    };
  } catch (error) {
    console.error('Erro na função de checkout:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Não foi possível criar a sessão de checkout.' }),
    };
  }
});

