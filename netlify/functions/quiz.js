// /netlify/functions/quiz.js

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Правильная и безопасная инициализация Firebase
// Проверяем, есть ли уже запущенные приложения
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({
      credential: cert(serviceAccount)
    });
  } catch (e) {
    console.error('Firebase initialization error in quiz.js:', e);
  }
}

const db = getFirestore();

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { action } = data;

    if (action === 'startSession') {
      const ipAddress = event.headers['x-nf-client-connection-ip'] || 'unknown';
      let countryCode = 'unknown';

      // Декодируем геолокационные данные от Netlify
      const geoHeader = event.headers['x-nf-geo'];
      if (geoHeader) {
          try {
              const geoData = JSON.parse(Buffer.from(geoHeader, 'base64').toString('utf8'));
              countryCode = geoData.country?.code || 'unknown';
          } catch (e) {
              console.error('Could not parse x-nf-geo header:', e);
          }
      }
      
      const newSessionRef = db.collection('sessions').doc();
      await newSessionRef.set({
        sessionId: newSessionRef.id,
        ipAddress: ipAddress,
        countryCode: countryCode, // Добавлено поле страны
        createdAt: new Date().toISOString(),
        answers: {}
      [span_0](start_span)});[span_0](end_span)
      
      return {
        statusCode: 200,
        body: JSON.stringify({ sessionId: newSessionRef.id }),
      [span_1](start_span)};[span_1](end_span)

    } else if (action === 'saveAnswer') {
      [span_2](start_span)const { sessionId, questionId, answer } = data;[span_2](end_span)
      if (!sessionId || !questionId || answer === undefined) {
          [span_3](start_span)return { statusCode: 400, body: 'Missing required fields' };[span_3](end_span)
      }

      [span_4](start_span)const sessionRef = db.collection('sessions').doc(sessionId);[span_4](end_span)
      await sessionRef.update({
        [`answers.${questionId}`]: answer,
        updatedAt: new Date().toISOString(),
        dropOffPoint: `question_${questionId}`
      [span_5](start_span)});[span_5](end_span)
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Answer saved' }),
      [span_6](start_span)};[span_6](end_span)
    }

    [span_7](start_span)return { statusCode: 400, body: 'Invalid action' };[span_7](end_span)
    
  } catch (error) {
    [span_8](start_span)console.error('Error in quiz.js handler:', error);[span_8](end_span)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    [span_9](start_span)};[span_9](end_span)
  }
};
