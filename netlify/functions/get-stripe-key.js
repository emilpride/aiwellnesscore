// /netlify/functions/get-stripe-key.js
// Эта функция безопасно передает публичный ключ Stripe на клиентскую часть.

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } };
  }
  // Убедимся, что ключ задан в переменных окружения Netlify.
  if (!process.env.PUBLIC_STRIPE_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Stripe public key is not configured on the server.' }),
    };
  }

  // Отправляем ключ на клиент.
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      publishableKey: process.env.PUBLIC_STRIPE_KEY,
    }),
  };
};
