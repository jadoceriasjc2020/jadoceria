// netlify/functions/stripe-webhook.js
const Stripe = require('stripe');
const fetch = require('node-fetch'); // se não estiver em package.json, instale; Netlify Node 18 tem global fetch, mas usar node-fetch evita inconsistências.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const wait = ms => new Promise(res => setTimeout(res, ms));

exports.handler = async (event) => {
  // Stripe requires raw body to validate signature
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const rawBody = event.body; // Netlify passa body como string por padrão
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed.', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const userId =
        session.client_reference_id ||
        (session.metadata && (session.metadata.userId || session.metadata.user_id));

      if (!userId) {
        console.error('No userId found in session:', session.id);
        return { statusCode: 400, body: 'No userId in checkout session' };
      }

      // Construir o endpoint admin do Identity no domínio do site
      const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
      if (!siteUrl) {
        console.error('SITE_URL not configured');
        return { statusCode: 500, body: 'SITE_URL not configured' };
      }
      const adminToken = process.env.NETLIFY_ADMIN_AUTH_TOKEN;
      if (!adminToken) {
        console.error('NETLIFY_ADMIN_AUTH_TOKEN not configured');
        return { statusCode: 500, body: 'NETLIFY_ADMIN_AUTH_TOKEN not configured' };
      }

      const url = `${siteUrl}/.netlify/identity/admin/users/${userId}`;
      const body = { app_metadata: { roles: ['premium'] } };

      // Retentativa inteligente: 5 tentativas com backoff exponencial
      const maxAttempts = 5;
      let attempt = 0;
      let lastRespText = null;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          const resp = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminToken}`,
            },
            body: JSON.stringify(body),
          });

          const respText = await resp.text();
          lastRespText = respText;
          if (resp.ok) {
            console.log(`User ${userId} updated to premium on attempt ${attempt}`);
            console.log('Netlify response:', respText);
            return { statusCode: 200, body: 'User updated' };
          }

          // 404 -> retry (possível propagação); 429 -> retry; outros códigos -> abortar
          if (resp.status === 404 || resp.status === 429) {
            console.warn(`Attempt ${attempt} got status ${resp.status}. Retrying after backoff...`);
            const delay = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s...
            await wait(delay);
            continue;
          } else if (resp.status === 401) {
            console.error('Unauthorized calling Netlify Identity admin endpoint. Check NETLIFY_ADMIN_AUTH_TOKEN scope.');
            console.error('Netlify response:', resp.status, respText);
            return { statusCode: 500, body: 'Unauthorized updating user - check token' };
          } else {
            console.error('Unexpected status from Netlify:', resp.status, respText);
            return { statusCode: 500, body: `Unexpected response: ${resp.status} - ${respText}` };
          }
        } catch (fetchErr) {
          console.error('Fetch error while updating Netlify user:', fetchErr.message);
          const delay = 1000 * Math.pow(2, attempt);
          await wait(delay);
        }
      } // fim while

      console.error(`Failed to update user after ${maxAttempts} attempts. Last response:`, lastRespText);
      return { statusCode: 500, body: 'Failed to update user after retries' };
    }

    // outros eventos Stripe que você possa querer manipular
    return { statusCode: 200, body: 'Event ignored' };
  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: `Handler error: ${err.message}` };
  }
};
