'use strict';
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Инициализация Firebase Admin
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in submission-created.js:", e);
  }
}
const db = getFirestore();

exports.handler = async (event) => {
  try {
    // Netlify передает данные формы в виде строки JSON в теле запроса
    const payload = JSON.parse(event.body).payload;

    console.log("Received submission for form:", payload.form_name);

    // Убедимся, что это наша контактная форма
    if (payload.form_name !== 'contact') {
      return { statusCode: 200, body: 'Not a contact form submission.' };
    }

    const { name, email, subject, message } = payload.data;

    // Сохраняем сообщение в новую коллекцию 'contact_submissions' в Firestore
    await db.collection('contact_submissions').add({
      name: name || 'N/A',
      email: email || 'N/A',
      subject: subject || 'N/A',
      message: message || 'N/A',
      createdAt: new Date().toISOString(),
      isRead: false // Добавляем флаг, чтобы отмечать прочитанные сообщения
    });

    console.log('Contact form submission saved to Firestore.');
    
    // Возвращаем Netlify успешный ответ
    return {
      statusCode: 200,
      body: 'Submission processed and saved to Firestore.',
    };
  } catch (error) {
    console.error('Error handling form submission:', error);
    return {
      statusCode: 500,
      body: 'Error processing submission.',
    };
  }
};
