// /netlify/functions/stripe-webhook.js
'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');
const crypto = require('crypto'); // Импорт crypto

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

// Функция для хеширования email
const hashEmail = (email) => {
    if (!email) return undefined;
    // Приводим к нижнему регистру и убираем пробелы
    const normalized = email.toLowerCase().trim();
    // Хешируем SHA256
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
    
    // Хешируем email перед отправкой
    const hashedEmail = sessionData.answers?.email ? hashEmail(sessionData.answers.email) : undefined;
    
    const eventData = {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
            em: hashedEmail ? [hashedEmail] : undefined, // Используем хешированный email
            client_ip_address: sessionData.ipAddress,
            country: sessionData.countryCode ? sessionData.countryCode.toLowerCase() : undefined
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
        access_token: accessToken // Добавляем токен в payload
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

      case 'payment_intent.payment_failed':
        await sessionRef.update({
          paymentStatus: 'failed',
          paymentAmountUSD: '0',
          failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
          updatedAt: new Date().toISOString()
        });
        console.log(`Payment failed for session: ${sessionId}`);
        break;

      case 'payment_intent.canceled':
        await sessionRef.update({
          paymentStatus: 'canceled',
          paymentAmountUSD: '0',
          updatedAt: new Date().toISOString()
        });
        console.log(`Payment canceled for session: ${sessionId}`);
        break;

      case 'payment_intent.processing':
        await sessionRef.update({
          paymentStatus: 'processing',
          updatedAt: new Date().toISOString()
        });
        console.log(`Payment processing for session: ${sessionId}`);
        break;

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }
  } catch (dbError) {
    console.error('Database update failed:', dbError);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
