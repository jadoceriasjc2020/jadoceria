// netlify/functions/create-checkout-session.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const parseJsonSafe = (str) => {
  try { return JSON.parse(str || '{}'); } catch (e) { return {}; }
};

exports.handler = async (event, context) => {
  try {
    // 1) obter dados do body de forma segura
    const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    let body = {};
    if (contentType.includes('application/json')) {
      body = parseJsonSafe(event.body);
    } else {
      // fallback: tentar parse anyway
      body = parseJsonSafe(event.body);
    }

    const priceId = body.priceId || null;
    const mode = body.mode || 'subscription';

    // 2) identificar userId: preferir o que foi enviado no body; senão usar context (Netlify)
    const userIdFromBody = body.userId || body.user_id || body.client_reference_id;
    const ctxUser = (context && context.clientContext && context.clientContext.user) || null;
    const userIdFromContext = ctxUser && (ctxUser.sub || ctxUser.id || ctxUser.user_id);
    const userId = userIdFromBody || userIdFromContext;

    // 3) validações e respostas consistentes em JSON
    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }
    if (!priceId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'priceId is required' }),
      };
    }
    if (!process.env.SITE_URL) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'SITE_URL not configured' }),
      };
    }

    // 4) criar sessão no Stripe
    const session = await stripe.checkout.sessions.create({
      mode: mode === 'payment' ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      success_url: `${process.env.SITE_URL}/?checkout=success`,
      cancel_url: `${process.env.SITE_URL}/?checkout=cancel`,
    });

    // 5) responder SEM redirect 303 — devolver JSON com a url para o frontend redirecionar
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_url: session.url }),
    };
  } catch (err) {
    console.error('create-checkout-session error:', err && err.stack ? err.stack : err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Internal error: ${err.message || err}` }),
    };
  }
};
