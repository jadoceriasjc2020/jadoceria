// netlify/functions/create-checkout-session.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { priceId, userId, userEmail } = body;

    if (!priceId) {
      return { statusCode: 400, body: 'priceId is required' };
    }
    if (!userId) {
      return { statusCode: 400, body: 'userId is required' };
    }

    const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
    if (!siteUrl) return { statusCode: 500, body: 'SITE_URL not configured' };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', // ou 'payment' se não for assinatura recorrente
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId, // **CRUCIAL** para linkar o usuário Netlify ao Stripe
      customer_email: userEmail || undefined,
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    });

    return {
      statusCode: 303,
      headers: { Location: session.url },
      body: '',
    };
  } catch (err) {
    console.error('create-checkout-session error', err);
    return { statusCode: 500, body: `Internal error: ${err.message}` };
  }
};
