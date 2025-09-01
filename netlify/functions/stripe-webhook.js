// /netlify/functions/stripe-webhook.js
'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in stripe-webhook.js:", e);
  }
}
const db = getFirestore();

exports.handler = async (event) => {
  // Добавляем логирование
  console.log('Webhook called with method:', event.httpMethod);
  console.log('Headers:', JSON.stringify(event.headers));
  
  // ВАЖНО: Stripe требует raw body
  const sig = event.headers['stripe-signature'];
  
  if (!sig) {
    console.error('No stripe signature found');
    return {
      statusCode: 400,
      body: 'No signature',
    };
  }

  let stripeEvent;
  
  try {
    // ВАЖНО: используем event.body напрямую
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('Event type:', stripeEvent.type);
    console.log('Event ID:', stripeEvent.id);
    
  } catch (err) {
    console.error(`Webhook signature verification failed:`, err.message);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  // Обработка события
  if (stripeEvent.type === 'payment_intent.succeeded') {
    const paymentIntent = stripeEvent.data.object;
    console.log('Payment succeeded for amount:', paymentIntent.amount);
    console.log('Metadata:', paymentIntent.metadata);
    
    const sessionId = paymentIntent.metadata?.sessionId;
    
    if (sessionId) {
      try {
        const paymentAmount = (paymentIntent.amount / 100).toFixed(2);
        
        const sessionRef = db.collection('sessions').doc(sessionId);
        await sessionRef.update({
          paymentStatus: 'succeeded',
          paymentAmountUSD: paymentAmount,
          stripePaymentIntentId: paymentIntent.id,
          paymentMethod: paymentIntent.payment_method_types[0] || 'card',
          updatedAt: new Date().toISOString()
        });
        
        console.log(`Successfully updated payment status for session: ${sessionId}`);
      } catch (dbError) {
        console.error('Database update failed:', dbError);
        // Не возвращаем ошибку Stripe, чтобы не вызвать повторную отправку
      }
    } else {
      console.warn('No sessionId in payment metadata');
    }
  }

  // Всегда возвращаем 200 для Stripe
  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
