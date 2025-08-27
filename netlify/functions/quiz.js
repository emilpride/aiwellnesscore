// Импортируем Firebase Admin SDK для работы с базой данных на сервере
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- НАСТРОЙКА FIREBASE ---
// Эти данные нужно будет добавить в переменные окружения на сайте Netlify
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// Инициализируем Firebase один раз, чтобы избежать повторных подключений
let db;
try {
  initializeApp({
    credential: cert(serviceAccount)
  });
  db = getFirestore();
} catch (e) {
  // Если приложение уже инициализировано, просто получаем доступ к Firestore
  if (!db) {
    db = getFirestore();
  }
}
// -------------------------

// Главный обработчик, который будет запускаться при обращении к функции
exports.handler = async (event, context) => {
  // Проверяем, что это POST-запрос. Если нет - возвращаем ошибку.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { action } = data;

    // Роутер: в зависимости от 'action' вызываем нужную функцию
    if (action === 'startSession') {
      // Получаем IP-адрес клиента из заголовков запроса
      const ipAddress = event.headers['x-nf-client-connection-ip'] || 'unknown';
      
      // Создаем новую сессию в базе данных
      const newSessionRef = db.collection('sessions').doc();
      await newSessionRef.set({
        sessionId: newSessionRef.id,
        ipAddress: ipAddress,
        createdAt: new Date().toISOString(),
        answers: {} // Создаем пустое поле для ответов
      });

      // Возвращаем ID новой сессии на фронтенд
      return {
        statusCode: 200,
        body: JSON.stringify({ sessionId: newSessionRef.id }),
      };

    } else if (action === 'saveAnswer') {
      const { sessionId, questionId, answer } = data;

      // Проверяем, что все необходимые данные переданы
      if (!sessionId || !questionId || answer === undefined) {
        return { statusCode: 400, body: 'Missing required fields' };
      }

      // Находим нужную сессию по ID
      const sessionRef = db.collection('sessions').doc(sessionId);
      
      // Обновляем документ, добавляя новый ответ в поле 'answers'
      // Используем точечную нотацию для обновления конкретного поля в объекте
      await sessionRef.update({
        [`answers.${questionId}`]: answer,
        updatedAt: new Date().toISOString(),
        dropOffPoint: `question_${questionId}` // Обновляем точку, до которой дошел юзер
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Answer saved' }),
      };
    }

    // Если 'action' не распознан, возвращаем ошибку
    return { statusCode: 400, body: 'Invalid action' };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
