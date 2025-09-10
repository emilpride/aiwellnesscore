// Эта функция будет запускаться по расписанию для повторной генерации неудачных отчетов
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in retry-failed-reports.js:", e);
  }
}
const db = getFirestore();

exports.handler = async (event) => {
  try {
    // Находим все сессии, где нужна ручная генерация отчета
    const failedReportsSnapshot = await db.collection('sessions')
      .where('needsManualReportGeneration', '==', true)
      .where('paymentStatus', '==', 'succeeded')
      .limit(10) // Обрабатываем по 10 за раз
      .get();
    
    if (failedReportsSnapshot.empty) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No failed reports to retry' })
      };
    }
    
    const retryPromises = [];
    
    failedReportsSnapshot.forEach(doc => {
      const sessionId = doc.id;
      const retryPromise = fetch(`${process.env.URL}/.netlify/functions/generate-report-hybrid`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ sessionId: sessionId })
      })
      .then(async (response) => {
        if (response.ok) {
          // Успешно - убираем флаг
          await db.collection('sessions').doc(sessionId).update({
            needsManualReportGeneration: false,
            reportGenerationError: null,
            reportRetrySuccessAt: new Date().toISOString()
          });
          return { sessionId, status: 'success' };
        } else {
          return { sessionId, status: 'failed', error: `HTTP ${response.status}` };
        }
      })
      .catch(error => {
        return { sessionId, status: 'failed', error: error.message };
      });
      
      retryPromises.push(retryPromise);
    });
    
    const results = await Promise.allSettled(retryPromises);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Retry completed',
        results: results.map(r => r.value || r.reason)
      })
    };
    
  } catch (error) {
    console.error('Error in retry-failed-reports:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
