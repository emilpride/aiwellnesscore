// /netlify/functions/stripe-webhook.js
'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ... (остальной код инициализации Firebase и вспомогательных функций)

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { console.error("Firebase init error in stripe-webhook.js:", e); }
}
const db = getFirestore();

// ... (вспомогательные функции hashData и sendPurchaseEventToMeta)

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  if (!sig) {
    console.error('Webhook Error: No stripe-signature header.');
    return { statusCode: 400, body: 'No signature' };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook signature verification failed:`, err.message);
    console.error('Make sure STRIPE_WEBHOOK_SECRET environment variable is set correctly in Netlify.');
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const paymentIntent = stripeEvent.data.object;
  const sessionId = paymentIntent.metadata?.sessionId;
  if (!sessionId) {
    console.warn('No sessionId in payment metadata. Ignoring webhook.');
    return { statusCode: 200, body: JSON.stringify({ received: true, message: 'No session ID' }) };
  }

  const sessionRef = db.collection('sessions').doc(sessionId);

  try {
    if (stripeEvent.type === 'payment_intent.succeeded') {
        console.log(`[${sessionId}] Payment succeeded. Amount:`, paymentIntent.amount);
        
        const paymentAmount = (paymentIntent.amount / 100).toFixed(2);
        
        await sessionRef.update({
          paymentStatus: 'succeeded',
          paymentAmountUSD: paymentAmount,
          stripePaymentIntentId: paymentIntent.id,
          paymentMethod: paymentIntent.payment_method_types[0] || 'card',
          updatedAt: new Date().toISOString(),
          // Webhook теперь ТОЛЬКО ставит задачу в очередь.
          reportStatus: 'queued',
          reportGenerationAttemptedAt: new Date().toISOString()
        });

        console.log(`[${sessionId}] Successfully updated payment status to 'succeeded' and report status to 'queued'.`);
        // Запуск генерации отчета удален. Этим займется report-processor.js.
    }
  } catch (dbError) {
    console.error(`[${sessionId}] Database update failed after webhook received:`, dbError);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};

