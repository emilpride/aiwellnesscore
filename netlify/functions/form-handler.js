// /netlify/functions/form-handler.js

'use strict';
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const querystring = require('querystring'); // Используем для парсинга данных формы

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in form-handler.js:", e);
  }
}
const db = getFirestore();

exports.handler = async (event) => {
  try {
    // При вызове через action, данные приходят в URL-кодированном виде
    const data = querystring.parse(event.body);

    console.log("Received submission for form:", data['form-name']);

    if (data['form-name'] !== 'contact') {
      return { statusCode: 400, body: 'Invalid form name.' };
    }

    // Сохраняем сообщение в Firestore
    await db.collection('contact_submissions').add({
      name: data.name || 'N/A',
      email: data.email || 'N/A',
      subject: data.subject || 'N/A',
      message: data.message || 'N/A',
      createdAt: new Date().toISOString(),
      isRead: false
    });

    console.log('Contact form submission saved to Firestore.');
    
    // После успешной обработки, перенаправляем пользователя на страницу "Спасибо"
    return {
      statusCode: 302, // 302 - это код для временного редиректа
      headers: {
        Location: '/thank-you.html',
      },
    };
  } catch (error) {
    console.error('Error handling form submission:', error);
    return {
      statusCode: 500,
      body: `Error: ${error.message}`,
    };
  }
};
