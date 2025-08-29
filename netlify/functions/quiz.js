// /netlify/functions/quiz.js - ИСПРАВЛЕННЫЙ КОД

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
      
      const newSessionRef = db.collection('sessions').doc();
      await newSessionRef.set({
        sessionId: newSessionRef.id,
        ipAddress: ipAddress,
        createdAt: new Date().toISOString(),
        answers: {}
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ sessionId: newSessionRef.id }),
      };

    } else if (action === 'saveAnswer') {
      const { sessionId, questionId, answer } = data;

      if (!sessionId || !questionId || answer === undefined) {
          return { statusCode: 400, body: 'Missing required fields' };
      }

      const sessionRef = db.collection('sessions').doc(sessionId);
      
      await sessionRef.update({
        [`answers.${questionId}`]: answer,
        updatedAt: new Date().toISOString(),
        dropOffPoint: `question_${questionId}`
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Answer saved' }),
      };
    }

    return { statusCode: 400, body: 'Invalid action' };

  } catch (error) {
    console.error('Error in quiz.js handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
