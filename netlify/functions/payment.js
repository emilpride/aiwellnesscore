// /netlify/functions/payment.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { console.error("Firebase init error in payment.js:", e); }
}
const db = getFirestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    // 1. Получаем все данные с фронтенда
    const { sessionId, plan, amount } = JSON.parse(event.body);

    if (!sessionId || !plan || !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Session ID, plan, and amount are required.' }) };
    }

    // 2. Записываем тип купленного плана в сессию пользователя
    const sessionRef = db.collection('sessions').doc(sessionId);
    await sessionRef.update({
      planType: plan // Например, 'advanced'
    });
    console.log(`[${sessionId}] Plan type "${plan}" saved to session.`);

    // 3. Создаем Payment Intent с правильной суммой
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Сумма в центах, например 1399
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { sessionId: sessionId }
    });
        console.log('Stripe Payment Intent Object:', JSON.stringify(paymentIntent, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (error) {
      console.error("Payment Intent creation error:", error);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

