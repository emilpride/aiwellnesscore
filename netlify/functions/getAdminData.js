// /netlify/functions/getAdminData.js

'use strict';
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Инициализация Firebase Admin SDK
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in getAdminData.js:", e);
  }
}
const db = getFirestore();

// Общее количество вопросов в квизе для расчета прогресса
const TOTAL_QUESTIONS = 16; 

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { password } = JSON.parse(event.body);

    // --- ПРОВЕРКА ПАРОЛЯ ---
    // Сравниваем пароль из запроса с переменной окружения SHAURMA
    if (password !== process.env.SHAURMA) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // --- ПОЛУЧЕНИЕ ДАННЫХ ---
    const sessionsRef = db.collection('sessions');
    const snapshot = await sessionsRef.orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    const sessionsData = snapshot.docs.map(doc => {
      const data = doc.data();
      const answers = data.answers || {};

      // Расчет прогресса
      const answeredCount = Object.keys(answers).length;
      const progress = `${answeredCount} of ${TOTAL_QUESTIONS} (${Math.round((answeredCount / TOTAL_QUESTIONS) * 100)}%)`;

      // Расчет продолжительности
      let duration = 'N/A';
      if (data.createdAt && data.quizEndedAt) {
        const start = new Date(data.createdAt);
        const end = new Date(data.quizEndedAt);
        const diffMs = end - start;
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = ((diffMs % 60000) / 1000).toFixed(0);
        duration = `${diffMins}m ${diffSecs}s`;
      }

      return {
        id: doc.id,
        createdAt: new Date(data.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        deviceType: data.deviceType || 'N/A',
        trafficSource: data.trafficSource || 'N/A',
        ipAddress: data.ipAddress || 'N/A',
        countryCode: data.countryCode || 'N/A',
        gender: answers.gender || 'N/A',
        age: answers.age || 'N/A',
        progress: progress,
        duration: duration,
        paymentStatus: data.paymentStatus || 'pending',
        paymentAmount: data.paymentAmountUSD ? `$${data.paymentAmountUSD}` : 'N/A',
        paymentMethod: 'Card', // Это поле не хранится, поэтому заглушка
        resultLink: `result.html?session_id=${data.sessionId}`
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify(sessionsData),
    };

  } catch (error) {
    console.error('Error in getAdminData function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
