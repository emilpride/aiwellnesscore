// /netlify/functions/generateProfile.js

// --- НАЧАЛО ИСПРАВЛЕНИЯ: Добавлен недостающий код инициализации Firebase ---
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({
      credential: cert(serviceAccount)
    });
  } catch (e) {
    console.error("Firebase init error in generateProfile.js:", e);
  }
}

const db = getFirestore();
// --- КОНЕЦ ИСПРАВЛЕНИЯ ---

// Импортируем вашу функцию расчета
const { calculateBioAge } = require('./bio-age-calculation.js');

exports.handler = async (event) => {
  // Добавим проверку метода на всякий случай
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try { // Обернем в try...catch для лучшей диагностики ошибок
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) {
        console.error("Session ID is missing in the request body.");
        return { statusCode: 400, body: JSON.stringify({ error: 'Session ID is required' }) };
    }
    console.log(`[${sessionId}] Starting profile generation.`);

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();
    
    if (!doc.exists) {
        console.error(`[${sessionId}] Document not found in Firestore.`);
        return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
    }
    console.log(`[${sessionId}] Document found.`);

    const sessionData = doc.data();
    const userAnswers = sessionData.answers;
    const faceAnalysis = sessionData.faceAnalysis; // Результат от Face++

    // 1. Рассчитываем биологический возраст
    const chronoAge = parseInt(userAnswers.age, 10);
    if (isNaN(chronoAge)) {
        console.error(`[${sessionId}] Invalid chronological age:`, userAnswers.age);
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid age provided' }) };
    }

    const bioAgeResult = calculateBioAge(chronoAge, userAnswers, faceAnalysis);
    console.log(`[${sessionId}] BioAge calculated:`, bioAgeResult);

    // 2. Сохраняем предварительные результаты в Firestore
    await sessionRef.update({
      preliminaryResult: bioAgeResult
    });
    console.log(`[${sessionId}] Preliminary result saved to Firestore.`);
    
    // 3. Возвращаем результат клиенту
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'complete', data: bioAgeResult }),
    };

  } catch (error) {
    console.error("Error in generateProfile handler:", error);
    return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
    };
  }
};
