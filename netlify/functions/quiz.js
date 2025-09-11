// /netlify/functions/quiz.js

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Logger = require('./utils/logger');
const RateLimiter = require('./utils/rateLimiter');

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

// /netlify/functions/quiz.js

exports.handler = async (event, context) => {
  // Получаем IP адрес
  const ip = event.headers['x-nf-client-connection-ip'] || 
             event.headers['x-forwarded-for'] ||
             'unknown';
  
  // Инициализируем логгер
  const logger = new Logger('quiz', null);

  if (event.httpMethod !== 'POST') {
    logger.warn('Invalid HTTP method', { method: event.httpMethod });
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { action } = data;
    
    // Обновляем логгер с sessionId если есть
    if (data.sessionId) {
      logger.sessionId = data.sessionId;
    }
    
    // Проверяем rate limit
    const rateLimitResult = await RateLimiter.checkLimit(ip, action);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { 
        ip, 
        action,
        retryAfter: rateLimitResult.retryAfter 
      });
      return {
        statusCode: 429,
        headers: {
          'Retry-After': Math.ceil(rateLimitResult.retryAfter / 1000).toString(),
          'X-RateLimit-Remaining': '0'
        },
        body: JSON.stringify({ 
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.retryAfter
        })
      };
    }

    logger.info(`Processing action: ${action}`, { ip });

    if (action === 'startSession') {
      const ipAddress = ip;
      let countryCode = 'unknown';
      const geoHeader = event.headers['x-nf-geo'];
      if (geoHeader) {
        try {
          const geoData = JSON.parse(Buffer.from(geoHeader, 'base64').toString('utf8'));
          countryCode = geoData.country?.code || 'unknown';
        } catch (e) {
          logger.error('Could not parse geo header', e);
        }
      }

      const trafficSource = data.source || 'unknown';
      const deviceType = data.deviceType || 'unknown';
      
      const newSessionRef = db.collection('sessions').doc();
      const sessionData = {
        sessionId: newSessionRef.id,
        ipAddress: ipAddress,
        countryCode: countryCode,
        trafficSource: trafficSource,
        deviceType: deviceType,
        paymentStatus: 'pending',
        createdAt: new Date().toISOString(),
        correlationId: logger.correlationId,
        answers: {},
        events: {} // Добавляем объект для событий
      };
      await newSessionRef.set(sessionData);
      
      logger.info('Session created successfully', { 
        sessionId: newSessionRef.id,
        countryCode,
        deviceType 
      });
      logger.metric('session_created', 1);

      return {
        statusCode: 200,
        headers: { 'X-RateLimit-Remaining': rateLimitResult.remaining.toString() },
        body: JSON.stringify({ sessionId: newSessionRef.id }),
      };

    } else if (action === 'saveAnswer') {
      const { sessionId, questionId, answer } = data;
      if (!sessionId || !questionId || answer === undefined) {
        logger.warn('Missing required fields for saveAnswer', { sessionId, questionId });
        return { statusCode: 400, body: 'Missing required fields' };
      }
      
      const sessionRef = db.collection('sessions').doc(sessionId);
      const sessionDoc = await sessionRef.get();
      if (!sessionDoc.exists) {
        logger.error('Session not found', { sessionId });
        return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
      }
      
      await sessionRef.update({
        [`answers.${questionId}`]: answer,
        updatedAt: new Date().toISOString(),
        dropOffPoint: `question_${questionId}`,
        lastCorrelationId: logger.correlationId
      });
      logger.info('Answer saved', { sessionId, questionId });

      return {
        statusCode: 200,
        headers: { 'X-RateLimit-Remaining': rateLimitResult.remaining.toString() },
        body: JSON.stringify({ message: 'Answer saved' }),
      };

    } else if (action === 'saveAnalysisData') {
      const { sessionId, analysisData } = data;
      if (!sessionId || !analysisData) {
        logger.warn('Missing required fields for saveAnalysisData');
        return { statusCode: 400, body: 'Missing required fields for saving analysis' };
      }
      
      const sessionRef = db.collection('sessions').doc(sessionId);
      const sessionDoc = await sessionRef.get();
      if (!sessionDoc.exists) {
        logger.error('Session not found for analysis data', { sessionId });
        return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
      }
      
      await sessionRef.update({
        faceAnalysis: analysisData,
        faceAnalysisCorrelationId: logger.correlationId,
        updatedAt: new Date().toISOString()
      });
      logger.info('Analysis data saved', { sessionId, hasFaces: analysisData.faces?.length > 0 });
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Analysis data saved successfully' })
      };

    } else if (action === 'endQuiz') {
      const { sessionId } = data;
      if (!sessionId) return { statusCode: 400, body: 'Missing sessionId' };
      
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.update({ quizEndedAt: new Date().toISOString() });
      logger.info('Quiz completed', { sessionId });
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Quiz end time recorded' })
      };

    } else if (action === 'logError') {
      const { sessionId, error } = data;
      if (!sessionId || !error) {
          return { statusCode: 400, body: 'Session ID and error object are required' };
      }
      
      logger.error('Client-side error logged', error);
      const sessionRef = db.collection('sessions').doc(sessionId);
      const errorEntry = {
          ...error,
          timestamp: new Date().toISOString(),
          correlationId: logger.correlationId
      };
      await sessionRef.update({
          errors: FieldValue.arrayUnion(errorEntry)
      });
      return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Error logged' })
      };

    } else if (action === 'trackEvent') { // <-- ПРАВИЛЬНОЕ МЕСТО ДЛЯ БЛОКА
      const { sessionId, eventName } = data;
      if (!sessionId || !eventName) {
          return { statusCode: 400, body: 'Session ID and event name are required' };
      }
      
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.update({
          [`events.${eventName}`]: new Date().toISOString()
      });

      logger.info('Event tracked', { sessionId, eventName });
      return { 
          statusCode: 200, 
          body: JSON.stringify({ message: 'Event tracked' })
      };
    }

    // Если ни одно из условий не сработало
    logger.warn('Invalid action', { action });
    return { statusCode: 400, body: 'Invalid action' };

  } catch (error) {
    logger.error('Handler error', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        correlationId: logger.correlationId 
      }),
    };
  }
};
