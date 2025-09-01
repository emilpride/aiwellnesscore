// /netlify/functions/stripe-webhook.js
'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');

// Инициализация Firebase
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in stripe-webhook.js:", e);
  }
}
const db = getFirestore();

// Функция для отправки события в Meta CAPI
const sendPurchaseEventToMeta = async (paymentIntent, sessionData) => {
    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
        console.warn('Meta Pixel ID or Access Token is not configured. Skipping CAPI event.');
        return;
    }

    const url = `https://graph.facebook.com/v18.0/${pixelId}/events`;
    
    const eventData = {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
            em: [sessionData.answers?.email?.toLowerCase()],
            client_ip_address: sessionData.ipAddress,
        },
        custom_data: {
            value: (paymentIntent.amount / 100).toFixed(2),
            currency: 'USD',
        },
        event_id: paymentIntent.id
    };

    const payload = {
        data: [eventData],
    };

    try {
        await axios.post(url, payload, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log(`Successfully sent CAPI Purchase event for session: ${sessionData.sessionId}`);
    } catch (error) {
        console.error('Failed to send CAPI event:', error.response ? error.response.data : error.message);
    }
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
        const docSnapshot = await sessionRef.get();
        if (docSnapshot.exists) {
            await sessionRef.update({
                paymentStatus: 'succeeded',
                paymentAmountUSD: (paymentIntent.amount / 100).toFixed(2),
                stripePaymentIntentId: paymentIntent.id,
                paymentMethod: paymentIntent.payment_method_types[0] || 'card',
                updatedAt: new Date().toISOString()
            });
            console.log(`Successfully updated payment status for session: ${sessionId}`);
            
            // Отправляем серверное событие после обновления статуса
            await sendPurchaseEventToMeta(paymentIntent, docSnapshot.data());
        } else {
            console.error(`Session not found for ID: ${sessionId}, cannot send CAPI event.`);
        }
        break;

      // ... можно добавить обработку других статусов (failed, canceled)
    }
  } catch (dbError) {
    console.error('Database update failed:', dbError);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
