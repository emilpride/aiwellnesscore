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

// Импортируем вашу функцию расчета
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
        console.error(`[${sessionId}] --- ERROR: Document not found in Firestore. This is the problem!`);
        return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
    }
    
    const sessionData = doc.data();
    console.log(`[${sessionId}] --- 2. Document found. Working with this data:`, JSON.stringify(sessionData.answers));

    const userAnswers = sessionData.answers;
    const faceAnalysis = sessionData.faceAnalysis;

    const chronoAge = parseInt(userAnswers.age, 10);
    if (isNaN(chronoAge)) {
        console.error(`[${sessionId}] --- ERROR: Invalid chronological age:`, userAnswers.age);
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid age provided' }) };
    }

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
    // Этот catch ловит ошибки до основной логики (например, JSON.parse)
    const sessionId = JSON.parse(event.body)?.sessionId || 'unknown';
    console.error(`[${sessionId}] --- FATAL HANDLER ERROR:`, error);
    return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
    };
  }
};
