// /netlify/functions/stripe-webhook.js
'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');
const crypto = require('crypto');

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

// ИЗМЕНЕНИЕ 1: Переименовали функцию для универсальности
// Функция для хеширования данных
const hashData = (data) => {
    if (!data) return undefined;
    const normalized = data.toLowerCase().trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
};

// Исправленная функция sendPurchaseEventToMeta
const sendPurchaseEventToMeta = async (paymentIntent, sessionData) => {
    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
        console.warn('Meta Pixel ID or Access Token is not configured. Skipping CAPI event.');
        return;
    }

    const url = `https://graph.facebook.com/v18.0/${pixelId}/events`;
    
    // ИЗМЕНЕНИЕ 2: Хешируем email и страну
    const hashedEmail = sessionData.answers?.email ? hashData(sessionData.answers.email) : undefined;
    const hashedCountry = sessionData.countryCode ? hashData(sessionData.countryCode) : undefined;
    
    const eventData = {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
            em: hashedEmail ? [hashedEmail] : undefined,
            client_ip_address: sessionData.ipAddress,
            country: hashedCountry, // <-- ИСПОЛЬЗУЕМ ЗАХЕШИРОВАННУЮ СТРАНУ
        },
        custom_data: {
            value: (paymentIntent.amount / 100).toFixed(2),
            currency: 'USD',
        },
        event_id: paymentIntent.id
    };

    // Удаляем undefined поля из user_data
    Object.keys(eventData.user_data).forEach(key => {
        if (eventData.user_data[key] === undefined) {
            delete eventData.user_data[key];
        }
    });

    const payload = {
        data: [eventData],
        access_token: accessToken
    };

    try {
        await axios.post(url, payload);
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

        // Отправка серверного события
        const doc = await sessionRef.get();
        if (doc.exists) {
            await sendPurchaseEventToMeta(paymentIntent, doc.data());
        }
        break;

      // ... (остальные case'ы без изменений)
      
    }
  } catch (dbError) {
    console.error('Database update failed:', dbError);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
