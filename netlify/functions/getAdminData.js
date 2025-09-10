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

// ОБНОВЛЕНО: Полностью синхронизированный список вопросов с quiz-new.html
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
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { password } = JSON.parse(event.body);
    if (password !== process.env.SHAURMA) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const sessionsRef = db.collection('sessions');
    const sessionsSnapshot = await sessionsRef.orderBy('createdAt', 'desc').limit(200).get();

    const messagesRef = db.collection('contact_submissions');
    const messagesSnapshot = await messagesRef.orderBy('createdAt', 'desc').get();

    let messagesData = [];
    if (!messagesSnapshot.empty) {
        messagesData = messagesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id, name: data.name, email: data.email, subject: data.subject,
                message: data.message,
                receivedAt: new Date(data.createdAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
            };
        });
    }

    if (sessionsSnapshot.empty) {
      return { statusCode: 200, body: JSON.stringify({ sessions: [], statistics: {}, messages: messagesData }) };
    }

    let totalRevenue = 0;
    let successfulPayments = 0;
    let completedQuizzes = 0;
    const trafficSourceCounts = {};
    const countryCounts = {};

    const sessionsData = sessionsSnapshot.docs.map(doc => {
      const data = doc.data();
      const answers = data.answers || {};
      
      const answeredKeys = Object.keys(answers).filter(key => ALL_QUESTION_KEYS.includes(key));
      const answeredCount = answeredKeys.length;
      const progressPercent = TOTAL_QUESTIONS > 0 ? Math.round((answeredCount / TOTAL_QUESTIONS) * 100) : 0;
      const progress = `${answeredCount} of ${TOTAL_QUESTIONS} (${progressPercent}%)`;

      if (answers.hasOwnProperty('email')) {
        completedQuizzes++;
      }

      let duration = 'N/A';
      if (data.createdAt && data.quizEndedAt) {
        const start = new Date(data.createdAt);
        const end = new Date(data.quizEndedAt);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffMs = end - start;
            if (diffMs >= 0) {
                const diffMins = Math.floor(diffMs / 60000);
                const diffSecs = ((diffMs % 60000) / 1000).toFixed(0);
                duration = `${diffMins}m ${diffSecs}s`;
            }
        }
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
        createdAt: data.createdAt,
        deviceType: data.deviceType || 'N/A',
        trafficSource: source,
        ipAddress: data.ipAddress || 'N/A',
        country: country,
        email: answers.email || 'N/A',
        gender: answers.gender || 'N/A',
        age: answers.age || 'N/A',
        userGoal: answers.userGoal || 'N/A', // <-- ДОБАВЛЕНО НОВОЕ ПОЛЕ
        progress: progress,
        progressPercent: progressPercent,
        dropOffPoint: String(data.dropOffPoint || 'N/A').replace('question_', ''),
        duration: duration,
        paymentStatus: data.paymentStatus || 'pending',
        paymentAmount: data.paymentAmountUSD ? `$${data.paymentAmountUSD}` : 'N/A',
        paymentMethod: data.paymentStatus === 'succeeded' ? 'Card/Wallet' : 'N/A',
        errors: data.errors || [],
        answers: answers,
        // Ссылка на новый гибридный отчет
        resultLink: `result-hybrid.html?session_id=${doc.id}`
      };
    });

    const statistics = {
        totalSessions: sessionsSnapshot.size,
        totalRevenue: totalRevenue.toFixed(2),
        successfulPayments,
        avgCheck: successfulPayments > 0 ? (totalRevenue / successfulPayments).toFixed(2) : "0.00",
        conversionRate: sessionsSnapshot.size > 0 ? ((successfulPayments / sessionsSnapshot.size) * 100).toFixed(2) : "0.00",
        quizCompletionRate: sessionsSnapshot.size > 0 ? ((completedQuizzes / sessionsSnapshot.size) * 100).toFixed(2) : "0.00",
        topTrafficSources: Object.entries(trafficSourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
        topCountries: Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessions: sessionsData,
        statistics,
        messages: messagesData
      }),
    };
  } catch (error) {
    console.error('Error in getAdminData function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
