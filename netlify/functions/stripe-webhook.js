// /netlify/functions/stripe-webhook.js
'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');

// ... (остальной код инициализации Firebase)

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { console.error("Firebase init error in stripe-webhook.js:", e); }
}
const db = getFirestore();

async function sendPurchaseToMeta(eventData) {
    // Использует ваши существующие переменные META_PIXEL_ID и META_ACCESS_TOKEN
    const { pixelId, accessToken, amount, currency, clientIpAddress, clientUserAgent } = eventData;
    if (!pixelId || !accessToken) {
        console.warn('ID Пикселя Meta или Токен Доступа отсутствуют. Пропускаем событие CAPI.');
        return;
    }

    const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
    
    const payload = {
        data: [ {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_source_url: process.env.URL,
            user_data: {
                client_ip_address: clientIpAddress,
                client_user_agent: clientUserAgent,
            },
            custom_data: {
                value: amount,
                currency: currency,
            }
        } ]
    };

    try {
        await axios.post(url, payload);
        console.log('Событие Purchase успешно отправлено в Meta CAPI.');
    } catch (error) {
        console.error('Не удалось отправить событие в Meta CAPI:', error.response ? error.response.data : error.message);
    }
}

// /netlify/functions/stripe-webhook.js

exports.handler = async (event) => {
  // --- 1. ПРОВЕРКА ПОДПИСИ ВЕБХУКА ---
  console.log('--- STRIPE WEBHOOK FUNCTION WAS TRIGGERED ---');
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
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // --- 2. ИЗВЛЕЧЕНИЕ ДАННЫХ ИЗ ВЕБХУКА ---
  const paymentIntent = stripeEvent.data.object;
  const sessionId = paymentIntent.metadata?.sessionId;

  if (!sessionId) {
    console.warn('No sessionId in payment metadata. Ignoring webhook.');
    return { statusCode: 200, body: JSON.stringify({ received: true, message: 'No session ID' }) };
  }

  const sessionRef = db.collection('sessions').doc(sessionId);

  // --- 3. ОБРАБОТКА СОБЫТИЯ УСПЕШНОЙ ОПЛАТЫ ---
  try {
    if (stripeEvent.type === 'payment_intent.succeeded') {
      console.log(`[${sessionId}] Payment succeeded. Amount:`, paymentIntent.amount);
      const paymentAmount = (paymentIntent.amount / 100).toFixed(2);
      
      // 3.1. Получаем данные сессии для CAPI
      const sessionDoc = await sessionRef.get();
      const sessionData = sessionDoc.data() || {};
      
      // 3.2. Обновляем статус платежа в Firestore
      await sessionRef.update({
        paymentStatus: 'succeeded',
        paymentAmountUSD: paymentAmount,
        stripePaymentIntentId: paymentIntent.id,
        paymentMethod: paymentIntent.payment_method_types[0] || 'card',
        updatedAt: new Date().toISOString(),
        reportStatus: 'queued',
        reportGenerationAttemptedAt: new Date().toISOString()
      });
      console.log(`[${sessionId}] Successfully updated payment status in Firestore.`);

      // 3.3. Отправляем событие 'Purchase' в Meta CAPI
      await sendPurchaseToMeta({
        pixelId: process.env.META_PIXEL_ID,
        accessToken: process.env.META_ACCESS_TOKEN,
        amount: paymentAmount,
        currency: 'USD',
        clientIpAddress: sessionData.ipAddress,
        clientUserAgent: event.headers['user-agent']
      });

      // 3.4. Запускаем генерацию отчета
      try {
        console.log(`[${sessionId}] Attempting to invoke generate-report-hybrid function...`);
        await fetch(`${process.env.URL}/.netlify/functions/generate-report-hybrid`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ sessionId: sessionId })
        });
        console.log(`[${sessionId}] Successfully invoked generate-report-hybrid.`);
      } catch (invocationError) {
          console.error(`[${sessionId}] CRITICAL: Error invoking generate-report-hybrid from webhook:`, invocationError);
          await sessionRef.update({
              reportStatus: 'error',
              reportError: 'Failed to trigger report generation from webhook.'
          });
      }
    }
  } catch (dbError) {
    console.error(`[${sessionId}] Database update failed after webhook received:`, dbError);
  }

  // --- 4. ВОЗВРАЩАЕМ УСПЕШНЫЙ ОТВЕТ STRIPE ---
  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};

