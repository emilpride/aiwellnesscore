// /netlify/functions/stripe-webhook.js
'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');
const crypto = require('crypto');

// ... (код инициализации Firebase и функции hashData, sendPurchaseEventToMeta остаются без изменений)
// ... existing code ...
const hashData = (data) => {
// ... existing code ...
};
const sendPurchaseEventToMeta = async (paymentIntent, sessionData) => {
// ... existing code ...
};


exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  if (!sig) {
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
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const paymentIntent = stripeEvent.data.object;
  const sessionId = paymentIntent.metadata?.sessionId;
  if (!sessionId) {
    console.warn('No sessionId in payment metadata');
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const sessionRef = db.collection('sessions').doc(sessionId);

  try {
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded':
        console.log('Payment succeeded for amount:', paymentIntent.amount);
        
        const paymentAmount = (paymentIntent.amount / 100).toFixed(2);
        
        await sessionRef.update({
          paymentStatus: 'succeeded',
          paymentAmountUSD: paymentAmount,
          stripePaymentIntentId: paymentIntent.id,
          paymentMethod: paymentIntent.payment_method_types[0] || 'card',
          updatedAt: new Date().toISOString()
        });
        console.log(`Successfully updated payment status for session: ${sessionId}`);

        // --- ИСПРАВЛЕННЫЙ БЛОК ---
// Запускаем генерацию отчета и ждем подтверждения запуска
console.log(`[${sessionId}] Triggering hybrid report generation...`);
try {
    const reportResponse = await fetch(`${process.env.URL}/.netlify/functions/generate-report-hybrid`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ sessionId: sessionId })
    });
    
    if (!reportResponse.ok) {
        console.error(`[${sessionId}] Report generation request failed with status: ${reportResponse.status}`);
        // Сохраняем информацию об ошибке в базу данных
        await sessionRef.update({
            reportGenerationError: `Failed to start report generation at ${new Date().toISOString()}`,
            needsManualReportGeneration: true
        });
    } else {
        console.log(`[${sessionId}] Report generation started successfully`);
    }
} catch (err) {
    console.error(`[${sessionId}] Critical error triggering report generation:`, err);
    // Критическая ошибка - обязательно сохраняем для ручной обработки
    await sessionRef.update({
        reportGenerationError: err.message,
        needsManualReportGeneration: true,
        errorTimestamp: new Date().toISOString()
    });
}
// --- КОНЕЦ ИСПРАВЛЕННОГО БЛОКА ---

        const doc = await sessionRef.get();
        if (doc.exists) {
            await sendPurchaseEventToMeta(paymentIntent, doc.data());
        }
        break;
    }
  } catch (dbError) {
    console.error('Database update failed:', dbError);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
