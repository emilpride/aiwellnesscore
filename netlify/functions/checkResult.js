// /netlify/functions/checkResult.js - УЛУЧШЕННАЯ ВЕРСИЯ

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { console.error("Firebase init error in checkResult.js:", e); }
}

const db = getFirestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) { return { statusCode: 400, body: 'Session ID is required' }; }

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      return { statusCode: 404, body: JSON.stringify({ status: 'error', message: 'Session not found' }) };
    }

    const sessionData = doc.data();
    // ДОБАВИТЬ ЭТИ СТРОКИ ДЛЯ ОТЛАДКИ:
console.log(`[${sessionId}] Session data status:`, {
    hasReportData: !!sessionData.reportData,
    hasReportError: !!sessionData.reportError,
    reportStatus: sessionData.reportStatus,
    paymentStatus: sessionData.paymentStatus
});

    // 1. Проверяем готовый отчет
    if (sessionData.reportData) {
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'complete', data: sessionData.reportData }),
  };
} 
// 2. Проверяем, не записала ли фоновая функция ошибку
else if (sessionData.reportError) {
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'error', message: sessionData.reportError }),
  };
} 
// 3. Проверяем промежуточные статусы
else if (sessionData.reportStatus === 'processing' || sessionData.reportStatus === 'queued') {
    return {
        statusCode: 200,
        body: JSON.stringify({ status: sessionData.reportStatus }), // Возвращаем текущий статус
    };
}
// 4. Если ничего нет, продолжаем ждать (старый статус "pending")
else {
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'pending' }),
  };
}
};
