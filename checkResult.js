const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Инициализация Firebase Admin SDK (убедитесь, что он не инициализируется повторно)
try {
  if (!global._firebaseApp) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    global._firebaseApp = initializeApp({ credential: cert(serviceAccount) });
  }
} catch (e) {
  console.error("Firebase initialization error in checkResult.js:", e);
}

const db = getFirestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) {
      return { statusCode: 400, body: 'Session ID is required' };
    }

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      return { statusCode: 404, body: JSON.stringify({ status: 'error', message: 'Session not found' }) };
    }

    const sessionData = doc.data();

    // Проверяем, есть ли в документе поле с готовым отчетом
    if (sessionData.reportData) {
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'complete', data: sessionData.reportData }),
      };
    } else {
      // Если отчета еще нет, сообщаем, что он в процессе подготовки
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'pending' }),
      };
    }
  } catch (error) {
    console.error('Error in checkResult function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ status: 'error', message: 'Internal Server Error' }),
    };
  }
};
