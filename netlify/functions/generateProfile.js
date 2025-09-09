// /netlify/functions/generateProfile.js

// Импортируем Firebase и вашу функцию расчета
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { calculateBioAge } = require('./bio-age-calculation.js'); // <-- Важно: нужно будет правильно настроить путь

// ... (код инициализации Firebase, как в других функциях)

exports.handler = async (event) => {
  const { sessionId } = JSON.parse(event.body);
  if (!sessionId) { /* ... обработка ошибки ... */ }

  const sessionRef = db.collection('sessions').doc(sessionId);
  const doc = await sessionRef.get();
  if (!doc.exists) { /* ... обработка ошибки ... */ }

  const sessionData = doc.data();
  const userAnswers = sessionData.answers;
  const faceAnalysis = sessionData.faceAnalysis; // Результат от Face++

  // 1. Рассчитываем биологический возраст, используя ваш существующий файл
  const chronoAge = parseInt(userAnswers.age); // Убедитесь, что возраст это число
  const bioAgeResult = calculateBioAge(chronoAge, userAnswers, faceAnalysis); [cite: 20]

  // 2. Сохраняем предварительные результаты в Firestore
  await sessionRef.update({
    preliminaryResult: bioAgeResult
  });

  // 3. Возвращаем результат клиенту для редиректа
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'complete', data: bioAgeResult }),
  };
};
