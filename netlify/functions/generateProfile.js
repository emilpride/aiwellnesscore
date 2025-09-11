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

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      console.error(`[${sessionId}] --- ERROR: Document not found in Firestore.`);
      return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
    }

    const sessionData = doc.data();

    // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Гарантируем, что userAnswers - это объект.
    const userAnswers = sessionData.answers || {};

    const faceAnalysis = sessionData.faceAnalysis;
    const chronoAge = parseInt(userAnswers.age, 10) || 30; // Используем значение по умолчанию 30

    const bioAgeResult = calculateBioAge(chronoAge, userAnswers, faceAnalysis);

    await sessionRef.update({
      preliminaryResult
