const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) { 
    console.error("Firebase init error:", e);
  }
}

const db = getFirestore();

function createPrompt(answers, faceAnalysis) {
    const quizData = Object.entries(answers)
      .filter(([key]) => !['selfie', 'faceAnalysis', 'skinAnalysis', 'reportData', 'reportStatus', 'reportError'].includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    // Полный prompt со всеми данными
    return `You are AI WELLNESSCORE wellness coach. Analyze this user data and generate comprehensive wellness report.

User Data:
${quizData}
${faceAnalysis ? 'Photo analysis: available' : 'Photo: not provided'}

Generate complete JSON report with ALL fields below. Be specific and personalized:

{
  "freeReport": {
    "archetype": "Creative metaphorical name (2-3 words like 'Resilient Phoenix')",
    "archetypeDescription": "Positive 2-3 sentence description of this archetype",
    "wellnessScore": [calculate 1-100 based on all factors],
    "wellnessAge": [estimate wellness age as number],
    "coreFour": {
      "mind": {"score": [0-100], "summary": "Specific insight about mental wellness"},
      "body": {"score": [0-100], "summary": "Specific insight about physical health"},
      "nutrition": {"score": [0-100], "summary": "Specific insight about diet quality"},
      "lifestyle": {"score": [0-100], "summary": "Specific insight about daily habits"}
    },
    "keyInsight": "Most important finding that connects multiple data points",
    "firstStep": "One specific, actionable step they can do today",
    "motivationTrigger": "Personalized motivational phrase based on their strengths",
    "peerComparison": "How they compare to others in their demographic"
  },
  "premiumReport": {
    "deepDive": {
      "sleepEfficiency": "Detailed analysis of sleep quality and patterns",
      "stressRecovery": "Analysis of stress management and recovery capability",
      "energyLevels": "Daily energy fluctuation patterns and causes",
      "metabolicHealth": "Metabolic health indicators based on lifestyle"
    },
    "fullPhotoAnalysis": "${faceAnalysis ? 'Detailed analysis of facial indicators showing stress, fatigue, and wellness markers' : 'Photo analysis not available - would provide facial wellness indicators'}",
    "sevenDayActionPlan": [
      {"day": 1, "task": "Specific morning routine task", "focus": "Mind", "duration": "10 min"},
      {"day": 2, "task": "Nutrition optimization task", "focus": "Nutrition", "duration": "15 min"},
      {"day": 3, "task": "Movement or exercise task", "focus": "Body", "duration": "20 min"},
      {"day": 4, "task": "Stress management technique", "focus": "Mind", "duration": "10 min"},
      {"day": 5, "task": "Sleep improvement ritual", "focus": "Lifestyle", "duration": "5 min"},
      {"day": 6, "task": "Social wellness activity", "focus": "Lifestyle", "duration": "30 min"},
      {"day": 7, "task": "Weekly reflection and planning", "focus": "Mind", "duration": "15 min"}
    ],
    "bmiAnalysis": "Calculate BMI if height/weight provided, explain what it means and limitations",
    "habitFormationIndex": "Assessment of their ability to form new habits with specific tips",
    "supplementaryInsights": {
      "hydration": "Specific daily water intake recommendation",
      "vitamins": "Key vitamins they should focus on",
      "circadianRhythm": "Optimal sleep-wake schedule for them"
    },
    "longTermRisks": "Main health risks if current habits continue for 5 years",
    "opportunities": "Top 3 opportunities for wellness improvement",
    "trajectoryForecast": {
      "currentPath": "Wellness score in 5 years if habits unchanged",
      "optimizedPath": "Wellness score in 5 years with recommended changes",
      "keyMilestones": "3 important milestones in their wellness journey"
    },
    "aiCoachNotes": "Personal, encouraging message addressing their specific situation"
  }
}

IMPORTANT: Generate actual personalized content for each field based on the user data. Return ONLY valid JSON.`;
}

exports.handler = async (event) => {
  console.log('generateReport called');
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let sessionId;
  
  try {
    const body = JSON.parse(event.body);
    sessionId = body.sessionId;
    
    if (!sessionId) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ status: 'error', message: 'Session ID required' }) 
      };
    }

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();
    
    if (!doc.exists) {
      return { 
        statusCode: 404, 
        body: JSON.stringify({ status: 'error', message: 'Session not found' }) 
      };
    }

    const sessionData = doc.data();
    
    // Если отчет уже есть, возвращаем его
    if (sessionData.reportData) {
      console.log('Returning existing report');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          status: 'complete', 
          data: sessionData.reportData 
        })
      };
    }

    console.log('Generating new report with Gemini');
    
    // Генерируем отчет с gemini-2.5-flash
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = createPrompt(sessionData.answers || {}, sessionData.faceAnalysis);
    
    // Добавляем настройки для более быстрой генерации
    const generationConfig = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    };
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });
    
    const response = await result.response;
    const rawText = response.text();
    
    console.log('Received response from Gemini');
    
    // Очищаем от markdown
    const cleanedText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    
    let reportData;
    try {
      reportData = JSON.parse(cleanedText);
      
      // Проверяем структуру
      if (!reportData.freeReport || !reportData.premiumReport) {
        throw new Error('Invalid report structure');
      }
      
      // Преобразуем строки в числа если нужно
      if (typeof reportData.freeReport.wellnessScore === 'string') {
        reportData.freeReport.wellnessScore = parseInt(reportData.freeReport.wellnessScore);
      }
      if (typeof reportData.freeReport.wellnessAge === 'string') {
        reportData.freeReport.wellnessAge = parseInt(reportData.freeReport.wellnessAge);
      }
      
    } catch (e) {
      console.error('Parse error, using fallback');
      // Более детальный fallback
      reportData = generateFallbackReport(sessionData.answers);
    }

    // Сохраняем в базу
    await sessionRef.update({ 
      reportData: reportData, 
      reportStatus: 'complete' 
    });

    console.log('Report saved successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        status: 'complete', 
        data: reportData 
      })
    };

  } catch (error) {
    console.error('Error generating report:', error);
    
    // Пытаемся вернуть fallback данные
    const fallbackData = generateFallbackReport({});
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        status: 'complete', 
        data: fallbackData
      })
    };
  }
};

function generateFallbackReport(answers) {
  return {
    freeReport: {
      archetype: "Wellness Explorer",
      archetypeDescription: "You're actively exploring paths to better health and well-being, showing curiosity and commitment to personal growth.",
      wellnessScore: 65,
      wellnessAge: 35,
      coreFour: {
        mind: {score: 60, summary: "Stress management needs attention for optimal mental clarity"},
        body: {score: 70, summary: "Good activity levels with room for consistency"},
        nutrition: {score: 65, summary: "Balanced approach with opportunities for improvement"},
        lifestyle: {score: 60, summary: "Sleep and daily routines could be optimized"}
      },
      keyInsight: "Your wellness journey shows strong potential - focusing on sleep quality could unlock improvements across all areas",
      firstStep: "Tonight, start a wind-down routine 30 minutes before bed without screens",
      motivationTrigger: "Every small step you take compounds into remarkable change",
      peerComparison: "You're performing better than 60% of people in your age group"
    },
    premiumReport: {
      deepDive: {
        sleepEfficiency: "Current sleep patterns suggest frequent interruptions",
        stressRecovery: "Recovery time from stress is longer than optimal",
        energyLevels: "Energy peaks mid-morning then drops significantly",
        metabolicHealth: "Metabolism shows signs of irregularity from meal timing"
      },
      fullPhotoAnalysis: "Analysis indicates moderate stress markers and fatigue signs around the eyes",
      sevenDayActionPlan: [
        {day: 1, task: "Start day with 5-minute breathing exercise", focus: "Mind", duration: "5 min"},
        {day: 2, task: "Add colorful vegetables to every meal", focus: "Nutrition", duration: "10 min"},
        {day: 3, task: "Take a 20-minute walk after lunch", focus: "Body", duration: "20 min"},
        {day: 4, task: "Practice gratitude journaling before bed", focus: "Mind", duration: "10 min"},
        {day: 5, task: "Prepare bedroom for optimal sleep", focus: "Lifestyle", duration: "15 min"},
        {day: 6, task: "Connect with a friend or family member", focus: "Lifestyle", duration: "30 min"},
        {day: 7, task: "Review week and plan next steps", focus: "Mind", duration: "15 min"}
      ],
      bmiAnalysis: "BMI calculation requires height and weight data",
      habitFormationIndex: "You show moderate habit-forming potential - start with one small change at a time",
      supplementaryInsights: {
        hydration: "Aim for 8 glasses of water daily",
        vitamins: "Consider vitamin D and B-complex supplementation",
        circadianRhythm: "Optimal sleep window: 10:30 PM - 6:30 AM"
      },
      longTermRisks: "Continued stress and poor sleep could impact cardiovascular health",
      opportunities: "Top opportunities: sleep optimization, stress management, consistent exercise",
      trajectoryForecast: {
        currentPath: "Wellness score likely to decrease to 55 in 5 years without changes",
        optimizedPath: "Wellness score could reach 85 with consistent improvements",
        keyMilestones: "Month 1: Better sleep, Month 3: Increased energy, Year 1: Transformed health"
      },
      aiCoachNotes: "You have everything needed to succeed - start small, be consistent, and celebrate progress"
    }
  };
}
