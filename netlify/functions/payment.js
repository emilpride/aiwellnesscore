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

async function getServerPricing() {
  // Default fallback pricing in USD (display dollars)
  const fallback = { currency: 'USD', prices: { basic: 9.99, advanced: 13.99, premium: 19.99 } };
  try {
    const doc = await db.collection('metadata').doc('pricing').get();
    if (!doc.exists) return fallback;
    const data = doc.data() || {};
    if (data.prices && typeof data.prices === 'object') {
      return { currency: data.currency || 'USD', prices: data.prices };
    }
    const { basic, advanced, premium, currency } = data;
    if ([basic, advanced, premium].some(v => typeof v !== 'number')) return fallback;
    return { currency: currency || 'USD', prices: { basic, advanced, premium } };
  } catch (e) {
    console.error('Failed to load pricing from Firestore:', e);
    return fallback;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { sessionId, plan } = JSON.parse(event.body);

    // Validate inputs (do NOT trust client amount)
    if (!sessionId || !plan) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Session ID and plan are required.' }) };
    }

    const normalizedPlan = String(plan).toLowerCase();
    if (!['basic', 'advanced', 'premium'].includes(normalizedPlan)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid plan selected.' }) };
    }

    // Load pricing from server-side source of truth
    const pricing = await getServerPricing();
    const priceDollars = pricing.prices[normalizedPlan];
    const amount = Math.max(50, Math.round((Number(priceDollars) || 0) * 100)); // enforce >= $0.50
    const currency = (pricing.currency || 'USD').toLowerCase();

    // Persist selected plan type into the session
    const sessionRef = db.collection('sessions').doc(sessionId);
    await sessionRef.update({ planType: normalizedPlan, updatedAt: new Date().toISOString() });
    console.log(`[${sessionId}] Plan type "${normalizedPlan}" saved to session.`);

    // Create Stripe PaymentIntent with server-computed amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: { sessionId }
    });

    // Do not log the entire object to avoid leaking client_secret
    console.log(`[${sessionId}] PaymentIntent created: ${paymentIntent.id}, amount: ${amount} ${currency}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (error) {
      console.error("Payment Intent creation error:", error);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ 
          userError: 'Failed to process payment. Please try again or contact support.', 
          details: error.message 
        }) 
      };
  }
};

