const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { 
    console.error("Firebase init error:", e);
    throw new Error("Firebase initialization failed");
  }
}

const db = getFirestore();

function createPrompt(answers, faceAnalysis) {
    const quizData = Object.entries(answers)
      .map(([key, value]) => {
        if (key === 'selfie' || key === 'faceAnalysis' || key === 'skinAnalysis' || key === 'reportData' || key === 'reportStatus' || key === 'reportError') return null;
        return `- ${key}: ${value}`;
      }).filter(Boolean).join('\n');
    
    const faceData = faceAnalysis ? `
    Face Analysis (non-medical indicators):
    - Apparent Age: ${faceAnalysis.age || 'N/A'}
    - Gender: ${faceAnalysis.gender || 'N/A'}
    - Smile detected: ${faceAnalysis.smile || 'N/A'}
    - Glasses type: ${faceAnalysis.glasses || 'N/A'}
    - Emotions detected: ${JSON.stringify(faceAnalysis.emotion || {})}
    ` : 'Face analysis was skipped.';

    return `
      You are AI WELLNESSCORE, an expert AI wellness coach.
      Based on the User Data below, generate a complete and valid JSON object for their wellness report.
      The JSON object MUST strictly follow the structure provided in the 'Task' section. Do not add any text or markdown before or after the JSON object.

      User Data:
      ${quizData}
      ${faceData}

      Task: Generate a JSON object with the following structure:
      {
        "freeReport": {
          "archetype": "A creative, metaphorical title for the user (e.g., 'Creative Owl').",
          "archetypeDescription": "A short, positive description of this archetype.",
          "wellnessScore": "An overall score from 1 to 100 based on all data.",
          "wellnessAge": "An estimated wellness age.",
          "coreFour": {
            "mind": {"score": 0-100, "summary": "Brief summary for mind."},
            "body": {"score": 0-100, "summary": "Brief summary for body."},
            "nutrition": {"score": 0-100, "summary": "Brief summary for nutrition."},
            "lifestyle": {"score": 0-100, "summary": "Brief summary for lifestyle."}
          },
          "keyInsight": "The single most important insight linking data points.",
          "firstStep": "One simple, actionable first step.",
          "motivationTrigger": "An inspiring phrase based on strengths.",
          "peerComparison": "A short, anonymous comparison."
        },
        "premiumReport": {
          "fullPhotoAnalysis": "Detailed non-medical insights from the face analysis.",
          "sevenDayActionPlan": [
            {"day": 1, "task": "A specific task for day 1.", "focus": "Mind"},
            {"day": 2, "task": "A specific task for day 2.", "focus": "Nutrition"}
          ],
          "aiCoachNotes": "A personal, encouraging note from the AI coach."
        }
      }
    `;
}

exports.handler = async (event) => {
  console.log('generateReport handler called');
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let sessionId;
  
  try {
    const body = JSON.parse(event.body);
    sessionId = body.sessionId;
    
    if (!sessionId) {
      console.error('No sessionId provided');
      return { 
        statusCode: 400, 
        body: JSON.stringify({ status: 'error', message: 'Session ID is required' }) 
      };
    }

    console.log('Fetching session:', sessionId);
    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();
    
    if (!doc.exists) {
      console.error('Session not found:', sessionId);
      return { 
        statusCode: 404, 
        body: JSON.stringify({ status: 'error', message: 'Session not found' }) 
      };
    }

    const sessionData = doc.data();
    
    // Если отчет уже есть, возвращаем его
    if (sessionData.reportData) {
      console.log('Report already exists for session:', sessionId);
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          status: 'complete', 
          data: sessionData.reportData 
        })
      };
    }

    // Проверяем наличие API ключа
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not found');
      throw new Error('AI service configuration error');
    }

    console.log('Generating report for session:', sessionId);
    await sessionRef.update({ reportStatus: 'processing' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const faceAnalysisData = sessionData.faceAnalysis || sessionData.skinAnalysis || null;
    const prompt = createPrompt(sessionData.answers || {}, faceAnalysisData);
    
    // Используем gemini-2.5-pro
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    console.log('AI Response received');
    
    // Очищаем ответ от markdown
    const cleanedText = rawText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    let reportData;
    try {
      reportData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', cleanedText);
      throw new Error('Invalid AI response format');
    }

    // Проверяем структуру ответа
    if (!reportData.freeReport || !reportData.freeReport.coreFour) {
      console.error('AI response missing required fields');
      throw new Error("AI response is missing critical data");
    }

    // Преобразуем строковые значения в числа, если нужно
    if (typeof reportData.freeReport.wellnessScore === 'string') {
      reportData.freeReport.wellnessScore = parseInt(reportData.freeReport.wellnessScore);
    }
    if (typeof reportData.freeReport.wellnessAge === 'string') {
      reportData.freeReport.wellnessAge = parseInt(reportData.freeReport.wellnessAge);
    }

    await sessionRef.update({ 
      reportData: reportData, 
      reportStatus: 'complete' 
    });

    console.log('Report successfully generated for session:', sessionId);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        status: 'complete', 
        data: reportData 
      })
    };

  } catch (error) {
    console.error('Error in generateReport:', error.message, error.stack);
    
    // Пытаемся обновить статус ошибки в базе
    if (sessionId) {
      try {
        const sessionRef = db.collection('sessions').doc(sessionId);
        await sessionRef.update({ 
          reportStatus: 'error', 
          reportError: error.message 
        });
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        status: 'error', 
        message: 'Failed to generate report. Please try again.' 
      })
    };
  }
};
