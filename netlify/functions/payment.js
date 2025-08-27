// Устанавливаем Stripe с помощью `npm install stripe`
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);

    // Создаем сессию оплаты в Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'AI WELLNESSCORE Premium Report',
            },
            unit_amount: 999, // $9.99 в центах
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.URL}/result.html?session_id=${sessionId}&payment=success`,
      cancel_url: `${process.env.URL}/result.html?session_id=${sessionId}&payment=cancel`,
      metadata: {
        sessionId: sessionId
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ id: session.id }),
    };
  } catch (error) {
    console.error('Stripe Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not create payment session' }),
    };
  }
};
