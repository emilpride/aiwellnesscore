const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

let db;
if (!global._firebaseApp) {
  global._firebaseApp = initializeApp({
    credential: cert(serviceAccount)
  });
}
db = getFirestore();

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
      return { statusCode: 404, body: 'Session not found' };
    }
    
    const sessionData = doc.data();
    
    // Здесь в будущем будет логика обращения к Gemini и Azure
    // А пока мы просто вернем ответы из квиза
    const reportData = {
        archetype: "Creative Owl", // Placeholder
        wellnessScore: 78, // Placeholder
        wellnessAge: 32, // Placeholder
        answers: sessionData.answers // Реальные данные из квиза
    };

    return {
      statusCode: 200,
      body: JSON.stringify(reportData),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
