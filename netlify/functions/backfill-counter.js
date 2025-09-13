'use strict';
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { console.error("Firebase init error in backfill-counter.js:", e); }
}
const db = getFirestore();

exports.handler = async (event) => {
  // Простая проверка пароля через query-параметр (?password=ВАШ_ПАРОЛЬ)
  const { password } = event.queryStringParameters;
  if (password !== process.env.SHAURMA) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    console.log('Starting to count all sessions...');
    const sessionsRef = db.collection('sessions');
    const snapshot = await sessionsRef.get();
    const totalCount = snapshot.size;

    console.log(`Found ${totalCount} total sessions. Updating metadata...`);

    const statsRef = db.collection('metadata').doc('sessions');
    await statsRef.set({
        totalCount: totalCount
    }, { merge: true });

    console.log('Metadata updated successfully!');

    return {
      statusCode: 200,
      body: `Successfully updated the total session count to: ${totalCount}`
    };

  } catch (error) {
    console.error('Error during backfill:', error);
    return {
      statusCode: 500,
      body: `An error occurred: ${error.message}`
    };
  }
};
