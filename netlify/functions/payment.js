// /netlify/functions/payment.js (ЭТОТ КОД ПРАВИЛЬНЫЙ, НЕ МЕНЯЙТЕ ЕГО)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') { /* ... */ }
  try {
    const { sessionId } = JSON.parse(event.body);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 999,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { sessionId: sessionId }
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (error) { /* ... */ }
};
