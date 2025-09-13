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
    const statsRef = db.collection('metadata').doc('sessions');
    const statsDoc = await statsRef.get();
    const totalSessionsCount = statsDoc.exists ? statsDoc.data().totalCount : 0;

    const { password, startDate, endDate } = JSON.parse(event.body);
    if (password !== process.env.SHAURMA) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const sessionsRef = db.collection('sessions');
    let query = sessionsRef.orderBy('createdAt', 'desc');

    if (startDate) { query = query.where('createdAt', '>=', new Date(startDate).toISOString()); }
    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.where('createdAt', '<=', endOfDay.toISOString());
    }

    query = query.limit(1000);

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

    if (sessionsSnapshot.empty) {
      return { statusCode: 200, body: JSON.stringify({ sessions: [], statistics: { totalSessions: totalSessionsCount }, messages: messagesData }) };
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
        // Добавляем поля для сортировки
        progressPercent: progressPercent,
        durationMs: durationMs,
        errorCount: data.errors ? data.errors.length : 0,
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
      body: JSON.stringify({
        sessions: sessionsData,
        statistics: { ...statistics, newerSessionsCount: newerSessionsCount },
        messages: messagesData
      }),
    };
  } catch (error) {
    console.error('Error in getAdminData function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};

