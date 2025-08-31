// /netlify/functions/payment.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);

    // Создаем "Намерение платежа" (PaymentIntent)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 999, // $9.99 в центах
      currency: 'usd',
      // Эта опция позволяет Stripe автоматически определять и предлагать методы оплаты,
      // такие как карты, Google Pay, Apple Pay и т.д.
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        sessionId: sessionId // Сохраняем sessionId для отчетности
      }
    });

    // Возвращаем на фронтенд только client_secret, это безопасно
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
