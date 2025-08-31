// /netlify/functions/getAdminData.js

'use strict';
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { console.error("Firebase init error in getAdminData.js:", e); }
}
const db = getFirestore();

// --- ИЗМЕНЕНИЕ: Список ключей вопросов для точного подсчета прогресса ---
const QUESTION_KEYS = [
    'age', 'gender', 'height', 'weight', 'sleep', 'activity', 'nutrition', 
    'processed_food', 'hydration', 'stress', 'mindfulness', 'mood', 
    'alcohol', 'smoking', 'screen_time'
];
const TOTAL_QUESTIONS = QUESTION_KEYS.length;

// --- ИЗМЕНЕНИЕ: Утилита для преобразования кода страны в название ---
const countryCodeToName = {
    US: "United States", DE: "Germany", FR: "France", GB: "United Kingdom", CA: "Canada", 
    AU: "Australia", JP: "Japan", CN: "China", IN: "India", BR: "Brazil", RU: "Russia",
    UA: "Ukraine", PL: "Poland", IT: "Italy", ES: "Spain", NL: "Netherlands", SE: "Sweden",
    // Добавьте другие страны по мере необходимости
};


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { password } = JSON.parse(event.body);

    if (password !== process.env.SHAURMA) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const sessionsRef = db.collection('sessions');
    const snapshot = await sessionsRef.orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      return { statusCode: 200, body: JSON.stringify({ sessions: [], statistics: {} }) };
    }

    // --- ИЗМЕНЕНИЕ: Обработка данных и расчет статистики ---
    let totalRevenue = 0;
    let successfulPayments = 0;
    let totalCompletionPercentage = 0;
    let completedQuizzes = 0;
    const trafficSourceCounts = {};
    const countryCounts = {};

    const sessionsData = snapshot.docs.map(doc => {
      const data = doc.data();
      const answers = data.answers || {};

      const answeredKeys = Object.keys(answers).filter(key => QUESTION_KEYS.includes(key));
      const answeredCount = answeredKeys.length;
      const progressPercent = Math.round((answeredCount / TOTAL_QUESTIONS) * 100);
      const progress = `${answeredCount} of ${TOTAL_QUESTIONS} (${progressPercent}%)`;
      totalCompletionPercentage += progressPercent;

      let duration = 'N/A';
      if (data.createdAt && data.quizEndedAt) {
        completedQuizzes++;
        const start = new Date(data.createdAt);
        const end = new Date(data.quizEndedAt);
        const diffMs = end - start;
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = ((diffMs % 60000) / 1000).toFixed(0);
        duration = `${diffMins}m ${diffSecs}s`;
      }

      if (data.paymentStatus === 'succeeded' && data.paymentAmountUSD) {
        successfulPayments++;
        totalRevenue += parseFloat(data.paymentAmountUSD);
      }
      
      const source = data.trafficSource || 'Direct';
      trafficSourceCounts[source] = (trafficSourceCounts[source] || 0) + 1;

      const country = countryCodeToName[data.countryCode] || data.countryCode || 'Unknown';
      countryCounts[country] = (countryCounts[country] || 0) + 1;

      return {
        id: doc.id,
        createdAt: new Date(data.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        deviceType: data.deviceType || 'N/A',
        trafficSource: source,
        ipAddress: data.ipAddress || 'N/A',
        country: country,
        gender: answers.gender || 'N/A',
        age: answers.age || 'N/A',
        progress: progress,
        duration: duration,
        paymentStatus: data.paymentStatus || 'pending',
        paymentAmount: data.paymentAmountUSD ? `$${data.paymentAmountUSD}` : 'N/A',
        paymentMethod: data.paymentStatus === 'succeeded' ? 'Card/Wallet' : 'N/A',
        resultLink: `result.html?session_id=${data.sessionId}`
      };
    });

    const statistics = {
        totalSessions: snapshot.size,
        totalRevenue: totalRevenue.toFixed(2),
        successfulPayments,
        avgCheck: successfulPayments > 0 ? (totalRevenue / successfulPayments).toFixed(2) : "0.00",
        conversionRate: snapshot.size > 0 ? ((successfulPayments / snapshot.size) * 100).toFixed(2) : "0.00",
        quizCompletionRate: snapshot.size > 0 ? ((completedQuizzes / snapshot.size) * 100).toFixed(2) : "0.00",
        topTrafficSources: Object.entries(trafficSourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
        topCountries: Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };

    return {
      statusCode: 200,
      body: JSON.stringify({ sessions: sessionsData, statistics }),
    };

  } catch (error) {
    console.error('Error in getAdminData function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
