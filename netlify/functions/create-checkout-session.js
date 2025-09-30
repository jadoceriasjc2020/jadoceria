const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Não precisamos mais da biblioteca JWT. A Netlify já nos dá o utilizador!

exports.handler = async (event, context) => {
  try {
    // ABORDAGEM SIMPLIFICADA: Pegar o utilizador diretamente do contexto da Netlify
    const { user } = context.clientContext;

    // Se não houver utilizador no contexto, significa que a pessoa não está logada.
    if (!user || !user.sub) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Utilizador não autenticado. Por favor, faça login novamente.' }),
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
      success_url: `${process.env.SITE_URL}/calculadora.html`,
      cancel_url: `${process.env.SITE_URL}/calculadora.html`,
      // Usamos o ID do utilizador que a Netlify nos deu
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

