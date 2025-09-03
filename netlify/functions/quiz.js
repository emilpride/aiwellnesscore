// /netlify/functions/quiz.js

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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
      const geoHeader = event.headers['x-nf-geo'];
      if (geoHeader) {
        try {
          const geoData = JSON.parse(Buffer.from(geoHeader, 'base64').toString('utf8'));
          countryCode = geoData.country?.code || 'unknown';
        } catch (e) {
          console.error('Could not parse x-nf-geo header:', e);
        }
      }

      const trafficSource = data.source || 'unknown';
      const deviceType = data.deviceType || 'unknown';
      
      const newSessionRef = db.collection('sessions').doc();
      await newSessionRef.set({
        sessionId: newSessionRef.id,
        ipAddress: ipAddress,
        countryCode: countryCode,
        trafficSource: trafficSource,
        deviceType: deviceType,
        paymentStatus: 'pending',
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

    // --- НОВЫЙ БЛОК ДЛЯ СОХРАНЕНИЯ РЕЗУЛЬТАТОВ АНАЛИЗА ---
    } else if (action === 'saveAnalysisData') {
      const { sessionId, analysisData } = data;
      if (!sessionId || !analysisData) {
        return { statusCode: 400, body: 'Missing required fields for saving analysis' };
      }
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.update({
        faceAnalysis: analysisData,
        updatedAt: new Date().toISOString()
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Analysis data saved successfully' })
      };
    // --- КОНЕЦ НОВОГО БЛОКА ---

    } else if (action === 'endQuiz') {
      const { sessionId } = data;
      if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' };
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.update({
        quizEndedAt: new Date().toISOString()
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Quiz end time recorded' })
      };

    } else if (action === 'updatePayment') {
    const { sessionId, status, amountUSD } = data;
    if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' };
    const sessionRef = db.collection('sessions').doc(sessionId);
    await sessionRef.update({
        paymentStatus: status,
        paymentAmountUSD: amountUSD
    });
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Payment details updated' })
    };

} else if (action === 'checkPaymentStatus') {
    const { sessionId } = data;
    if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' };
    
    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();
    
    if (!doc.exists) {
        return { statusCode: 404, body: JSON.stringify({ status: 'not_found' }) };
    }
    
    const sessionData = doc.data();
    return {
        statusCode: 200,
        body: JSON.stringify({ 
            status: sessionData.paymentStatus || 'pending',
            amount: sessionData.paymentAmountUSD || null
        })
    };
}
// /netlify/functions/quiz.js
// ... (после блока 'checkPaymentStatus')

// --- НОВЫЙ БЛОК ДЛЯ ЛОГИРОВАНИЯ ОШИБОК ---
} else if (action === 'logError') {
    const { sessionId, error } = data;
    if (!sessionId || !error) {
        return { statusCode: 400, body: 'Session ID and error object are required' };
    }
    
    // Используем FieldValue.arrayUnion для атомарного добавления ошибки в массив
    const { FieldValue } = require('firebase-admin/firestore');
    const sessionRef = db.collection('sessions').doc(sessionId);

    const errorEntry = {
        ...error,
        timestamp: new Date().toISOString()
    };

    await sessionRef.update({
        errors: FieldValue.arrayUnion(errorEntry)
    });

    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Error logged' })
    };
// --- КОНЕЦ НОВОГО БЛОКА ---

}

return { statusCode: 400, body: 'Invalid action' };
return { statusCode: 400, body: 'Invalid action' };

  } catch (error) {
    console.error('Error in quiz.js handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
