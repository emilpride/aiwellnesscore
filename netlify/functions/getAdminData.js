'use strict';
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const RateLimiter = require('./utils/rateLimiter');

// Lazy Firebase init to avoid 502 when env is missing/misconfigured
function ensureFirestore() {
  try {
    if (!getApps().length) {
      const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set');
      }
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(key);
      } catch (e) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON');
      }
      initializeApp({ credential: cert(serviceAccount) });
    }
    return getFirestore();
  } catch (e) {
    // Surface a controlled error; caller will format response
    e._firebaseInit = true;
    throw e;
  }
}

const ALL_QUESTION_KEYS = [
    'userGoal', 'age', 'gender', 'height', 'weight', 'sleep', 'activity',
    'nutrition', 'processed_food', 'hydration', 'stress', 'mindfulness',
    'mood', 'alcohol', 'smoking', 'screen_time', 'selfie', 'email'
];
const TOTAL_QUESTIONS = ALL_QUESTION_KEYS.length;

const countryCodeToName = {
    US: "United States", DE: "Germany", FR: "France", GB: "United Kingdom", CA: "Canada",
    AU: "Australia", JP: "Japan", CN: "China", IN: "India", BR: "Brazil", RU: "Russia",
    UA: "Ukraine", PL: "Poland", IT: "Italy", ES: "Spain", NL: "Netherlands", SE: "Sweden",
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    // Initialize Firestore safely
    const db = ensureFirestore();
    // Basic rate limiting per IP and action
    const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
    const body = JSON.parse(event.body);
    const action = body?.action || 'getAdminData';
    const rate = await RateLimiter.checkLimit(ip, action);
    if (!rate.allowed) {
      return { statusCode: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(rate.retryAfter/1000).toString() }, body: JSON.stringify({ error: 'Too many requests' }) };
    }

    const statsRef = db.collection('metadata').doc('sessions');
    const statsDoc = await statsRef.get();
    const totalSessionsCount = statsDoc.exists ? statsDoc.data().totalCount : 0;

    const { password, startDate, endDate, pricing } = body;
    if (password !== process.env.SHAURMA) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Handle admin updates for pricing
    if (action === 'updatePricing') {
      const p = pricing || {};
      const basic = Number(p.basic);
      const advanced = Number(p.advanced);
      const premium = Number(p.premium);
      const currency = (p.currency || 'USD').toUpperCase();
      if ([basic, advanced, premium].some(v => !Number.isFinite(v) || v <= 0)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid pricing values' }) };
      }
      await db.collection('metadata').doc('pricing').set({
        currency,
        prices: { basic, advanced, premium },
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    const sessionsRef = db.collection('sessions');
    let query = sessionsRef.orderBy('createdAt', 'desc');

    if (startDate) { query = query.where('createdAt', '>=', new Date(startDate).toISOString()); }
    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.where('createdAt', '<=', endOfDay.toISOString());
    }

    query = query.limit(300);

    const sessionsSnapshot = await query.get();
    
    let newerSessionsCount = 0;
    if (!sessionsSnapshot.empty && (startDate || endDate)) {
        const firstDocTimestamp = sessionsSnapshot.docs[0].data().createdAt;
        const newerSessionsQuery = sessionsRef.where('createdAt', '>', firstDocTimestamp);
        const newerSessionsSnapshot = await newerSessionsQuery.count().get();
        newerSessionsCount = newerSessionsSnapshot.data().count;
    }

    const messagesRef = db.collection('contact_submissions');
    const messagesSnapshot = await messagesRef.orderBy('createdAt', 'desc').get();
    let messagesData = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), receivedAt: new Date(doc.data().createdAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) }));

    // Load pricing to return for admin UI
    let pricingDoc = await db.collection('metadata').doc('pricing').get();
    let pricingData = { currency: 'USD', prices: { basic: 9.99, advanced: 13.99, premium: 19.99 } };
    if (pricingDoc.exists) {
      const pd = pricingDoc.data() || {};
      if (pd.prices && typeof pd.prices === 'object') {
        pricingData = { currency: pd.currency || 'USD', prices: pd.prices };
      } else {
        // legacy flat shape support
        const { basic, advanced, premium, currency } = pd;
        if ([basic, advanced, premium].every(v => typeof v === 'number')) {
          pricingData = { currency: currency || 'USD', prices: { basic, advanced, premium } };
        }
      }
    }

    if (sessionsSnapshot.empty) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessions: [], statistics: { totalSessions: totalSessionsCount, sessionsInPeriod: 0, completedQuizzes: 0 }, messages: messagesData, pricing: pricingData }) };
    }
    
    let totalRevenue = 0, successfulPayments = 0, completedQuizzes = 0, totalErrors = 0;
    const trafficSourceCounts = {}, countryCounts = {}, osCounts = {}, genderCounts = {}, dropOffCounts = {}, userGoalCounts = {};
    const maleAges = [], femaleAges = [];
    let totalDurationMs = 0, durationCount = 0;

    const sessionsData = sessionsSnapshot.docs.map(doc => {
      const data = doc.data();
      const answers = data.answers || {};

      const answeredKeys = Object.keys(answers).filter(key => ALL_QUESTION_KEYS.includes(key));
      const answeredCount = answeredKeys.length;
      const progressPercent = TOTAL_QUESTIONS > 0 ? Math.round((answeredCount / TOTAL_QUESTIONS) * 100) : 0;
      const progress = `${answeredCount} of ${TOTAL_QUESTIONS} (${progressPercent}%)`;
      
      if (data.deviceType) {
        const os = data.deviceType.split('/')[1] || 'Unknown';
        osCounts[os] = (osCounts[os] || 0) + 1;
      }

      if (answers.gender && (answers.gender === 'male' || answers.gender === 'female')) {
        genderCounts[answers.gender] = (genderCounts[answers.gender] || 0) + 1;
        if (answers.age) {
          if (answers.gender === 'male') maleAges.push(parseInt(answers.age, 10));
          if (answers.gender === 'female') femaleAges.push(parseInt(answers.age, 10));
        }
      }
      
      const dropOffDisplay = progressPercent === 100 ? 'Completed' : String(data.dropOffPoint || 'N/A').replace('question_', '');
      if (dropOffDisplay !== 'Completed' && dropOffDisplay !== 'N/A') {
        dropOffCounts[dropOffDisplay] = (dropOffCounts[dropOffDisplay] || 0) + 1;
      }

      if (answers.userGoal) { userGoalCounts[answers.userGoal] = (userGoalCounts[answers.userGoal] || 0) + 1; }
      if (data.errors) { totalErrors += data.errors.length; }
      
      let duration = 'N/A';
      let durationMs = null;
      if (data.createdAt && data.quizEndedAt) {
        const start = new Date(data.createdAt);
        const end = new Date(data.quizEndedAt);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffMs = end - start;
            if (diffMs >= 0) {
                totalDurationMs += diffMs;
                durationCount++;
                durationMs = diffMs;
                const diffMins = Math.floor(diffMs / 60000);
                const diffSecs = Math.round((diffMs % 60000) / 1000);
                duration = `${diffMins}m ${diffSecs}s`;
            }
        }
      }
      
      if (answers.hasOwnProperty('email')) { completedQuizzes++; }
      if (data.paymentStatus === 'succeeded' && data.paymentAmountUSD) {
        successfulPayments++;
        totalRevenue += parseFloat(data.paymentAmountUSD);
      }
      const source = data.trafficSource || 'Direct';
      trafficSourceCounts[source] = (trafficSourceCounts[source] || 0) + 1;
      const country = countryCodeToName[data.countryCode] || data.countryCode || 'Unknown';
      countryCounts[country] = (countryCounts[country] || 0) + 1;

      return {
        id: doc.id, createdAt: data.createdAt, deviceType: data.deviceType || 'N/A', trafficSource: source, ipAddress: data.ipAddress || 'N/A',
        country: country, email: answers.email || 'N/A', gender: answers.gender || 'N/A', age: answers.age || 'N/A', userGoal: answers.userGoal || 'N/A',
        progress: progress, dropOffPoint: dropOffDisplay, duration: duration, paymentStatus: data.paymentStatus || 'pending',
        paymentAmount: data.paymentAmountUSD ? `$${data.paymentAmountUSD}` : 'N/A', errors: data.errors || [], events: data.events || {},
        resultLink: `result.html?session_id=${doc.id}`,
        progressPercent: progressPercent,
        durationMs: durationMs,
        errorCount: data.errors ? data.errors.length : 0,
        answers: answers,
      };
    });

    const calculateAverage = (arr) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "N/A";
    const totalOsCount = Object.values(osCounts).reduce((a,b) => a + b, 0);
    const totalGenderCount = Object.values(genderCounts).reduce((a,b) => a + b, 0);
    
    let avgDurationStr = "N/A";
    if (durationCount > 0) {
        const avgMs = totalDurationMs / durationCount;
        const avgMins = Math.floor(avgMs / 60000);
        const avgSecs = Math.round((avgMs % 60000) / 1000);
        avgDurationStr = `${avgMins}m ${avgSecs}s`;
    }

    const statistics = {
        totalSessions: totalSessionsCount,
        sessionsInPeriod: sessionsSnapshot.size,
        completedQuizzes: completedQuizzes,
        totalRevenue: totalRevenue.toFixed(2),
        successfulPayments,
        avgCheck: successfulPayments > 0 ? (totalRevenue / successfulPayments).toFixed(2) : "0.00",
        conversionRate: sessionsSnapshot.size > 0 ? ((successfulPayments / sessionsSnapshot.size) * 100).toFixed(2) : "0.00",
        quizCompletionRate: sessionsSnapshot.size > 0 ? ((completedQuizzes / sessionsSnapshot.size) * 100).toFixed(2) : "0.00",
        topTrafficSources: Object.entries(trafficSourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
        topCountries: Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
        osBreakdown: Object.entries(osCounts).map(([os, count]) => ({ os, percent: totalOsCount > 0 ? ((count/totalOsCount)*100).toFixed(1) : 0 })),
        genderBreakdown: Object.entries(genderCounts).map(([gender, count]) => ({ gender, percent: totalGenderCount > 0 ? ((count/totalGenderCount)*100).toFixed(1) : 0 })),
        avgMaleAge: calculateAverage(maleAges),
        avgFemaleAge: calculateAverage(femaleAges),
        avgDuration: avgDurationStr,
        topDropOff: Object.entries(dropOffCounts).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0],
        topUserGoal: Object.entries(userGoalCounts).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0],
        totalErrors: totalErrors
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessions: sessionsData,
        statistics: { ...statistics, newerSessionsCount: newerSessionsCount },
        messages: messagesData,
        pricing: pricingData
      }),
    };
  } catch (error) {
    console.error('Error in getAdminData function:', error);
    const message = error && error._firebaseInit ? `Configuration error: ${error.message}` : 'Internal Server Error';
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
  }
};

