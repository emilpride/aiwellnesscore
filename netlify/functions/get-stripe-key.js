// /netlify/functions/get-stripe-key.js
// Эта функция безопасно передает публичный ключ Stripe на клиентскую часть.

exports.handler = async (event, context) => {
  // Убедимся, что ключ задан в переменных окружения Netlify.
  if (!process.env.PUBLIC_STRIPE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Stripe public key is not configured on the server.' }),
    };
  }

  // Отправляем ключ на клиент.
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      publishableKey: process.env.PUBLIC_STRIPE_KEY,
    }),
  };
};
