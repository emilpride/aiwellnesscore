// /netlify/functions/payment.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);

    // Создаем PaymentIntent вместо Checkout Session
    // Это позволит нам использовать встроенную форму (Stripe Elements)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 999, // $9.99 в центах
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        sessionId: sessionId
      }
    });

    // Отправляем на фронтенд client_secret, который необходим для Stripe Elements
    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };

  } catch (error) {
    console.error('Stripe Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not create payment intent' }),
    };
  }
};
