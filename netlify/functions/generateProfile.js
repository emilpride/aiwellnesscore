// /netlify/functions/generateProfile.js

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
const { calculateBioAge } = require('./bio-age-calculation.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) {
      console.error("Session ID is missing in the request body.");
      return { statusCode: 400, body: JSON.stringify({ error: 'Session ID is required' }) };
    }
    console.log(`[${sessionId}] --- 1. Starting profile generation.`);

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      console.error(`[${sessionId}] --- ERROR: Document not found in Firestore.`);
      return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
    }
    
    const sessionData = doc.data();
    
    // --- КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ ---
    // Гарантируем, что userAnswers - это объект, даже если в базе его еще нет
    const userAnswers = sessionData.answers || {};
    // --- КОНЕЦ КЛЮЧЕВОГО ИСПРАВЛЕНИЯ ---
    
    const faceAnalysis = sessionData.faceAnalysis;
    
    // Используем значения по умолчанию прямо при получении данных
    const chronoAge = parseInt(userAnswers.age, 10) || 30; // По умолчанию 30 лет

    // Передаем в функцию расчета userAnswers, который теперь точно является объектом
    const bioAgeResult = calculateBioAge(chronoAge, userAnswers, faceAnalysis);
    
    console.log(`[${sessionId}] --- 3. BioAge calculated successfully:`, JSON.stringify(bioAgeResult));

    try {
      console.log(`[${sessionId}] --- 4. Attempting to save preliminaryResult to Firestore...`);
      await sessionRef.update({
        preliminaryResult: bioAgeResult
      });
      console.log(`[${sessionId}] --- 5. SUCCESS! Preliminary result saved to Firestore.`);
    } catch (dbError) {
      console.error(`[${sessionId}] --- FATAL ERROR: Could not update document in Firestore.`, dbError);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Failed to save result to database.', details: dbError.message }) 
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'complete', data: bioAgeResult }),
    };

  } catch (error) {
    const sessionIdFromEvent = event.body ? JSON.parse(event.body)?.sessionId : 'unknown';
    console.error(`[${sessionIdFromEvent || 'unknown'}] --- FATAL HANDLER ERROR:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'We could not generate your profile. Please try again.', 
        details: error.message 
      })
    };
  }
};
