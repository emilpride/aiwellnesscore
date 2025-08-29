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
    Face Analysis available: yes
    ` : 'Face analysis: skipped';

    return `
      You are AI WELLNESSCORE, an expert AI wellness coach.
      Generate a comprehensive wellness report based on the user data below.
      Return ONLY valid JSON without any markdown formatting.

      User Data:
      ${quizData}
      ${faceData}

      Generate JSON with this EXACT structure:
      {
        "freeReport": {
          "archetype": "Creative metaphorical title like 'Resilient Phoenix'",
          "archetypeDescription": "2-3 sentence positive description",
          "wellnessScore": [number 1-100],
          "wellnessAge": [number],
          "coreFour": {
            "mind": {"score": [0-100], "summary": "Brief insight"},
            "body": {"score": [0-100], "summary": "Brief insight"},
            "nutrition": {"score": [0-100], "summary": "Brief insight"},
            "lifestyle": {"score": [0-100], "summary": "Brief insight"}
          },
          "keyInsight": "Most important finding linking multiple data points",
          "firstStep": "One specific, actionable step to start today",
          "motivationTrigger": "Inspiring phrase based on user's strengths",
          "peerComparison": "Anonymous comparison with demographic group"
        },
        "premiumReport": {
          "deepDive": {
            "sleepEfficiency": "Detailed sleep quality analysis",
            "stressRecovery": "Stress recovery index analysis",
            "energyLevels": "Daily energy pattern analysis",
            "metabolicHealth": "Metabolic indicators assessment"
          },
          "fullPhotoAnalysis": "Detailed non-medical facial analysis if photo provided",
          "sevenDayActionPlan": [
            {"day": 1, "task": "Specific morning routine task", "focus": "Mind", "duration": "10 min"},
            {"day": 2, "task": "Nutrition optimization task", "focus": "Nutrition", "duration": "15 min"},
            {"day": 3, "task": "Movement practice", "focus": "Body", "duration": "20 min"},
            {"day": 4, "task": "Stress management technique", "focus": "Mind", "duration": "10 min"},
            {"day": 5, "task": "Sleep optimization ritual", "focus": "Lifestyle", "duration": "5 min"},
            {"day": 6, "task": "Social wellness activity", "focus": "Lifestyle", "duration": "30 min"},
            {"day": 7, "task": "Weekly reflection practice", "focus": "Mind", "duration": "15 min"}
          ],
          "bmiAnalysis": "BMI calculation with interpretation based on height/weight data",
          "habitFormationIndex": "Assessment of habit-forming potential with specific tips",
          "supplementaryInsights": {
            "hydration": "Daily water intake recommendation",
            "vitamins": "Key vitamin considerations",
            "circadianRhythm": "Optimal daily schedule suggestions"
          },
          "longTermRisks": "5-year health trajectory risks based on current habits",
          "opportunities": "Key opportunities for wellness improvement",
          "trajectoryForecast": {
            "currentPath": "Wellness score projection if habits unchanged",
            "optimizedPath": "Wellness score projection with recommendations",
            "keyMilestones": "Important checkpoints in wellness journey"
          },
          "aiCoachNotes": "Personal, encouraging message from AI coach"
        }
      }`;
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
