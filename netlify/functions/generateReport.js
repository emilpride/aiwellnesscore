// /netlify/functions/generateReport.js

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
    .filter(([key]) => !['selfie','faceAnalysis','skinAnalysis','reportData','reportStatus','reportError'].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  const faceData = faceAnalysis
    ? "User uploaded a photo. Face++ analysis is available."
    : "No photo uploaded.";

  return `You are AI WELLNESSCORE, an expert AI wellness coach. 
Analyze this user data and generate a comprehensive wellness report in JSON format.
Do not include any extra text, comments or markdown. Only valid JSON.

User Data:
${quizData}
${faceData}

The JSON MUST strictly follow this structure:

{
  "freeReport": {
    "metrics": {
      "wellnessScore": "Overall wellness score from 1-100",
      "biologicalAge": "Estimated biological age combining lifestyle + Face++ age",
      "energyIndex": "Energy level index based on sleep, activity, and fatigue signs",
      "stressLevel": "Stress index combining answers + facial markers"
    },
    "coreFour": {
      "mind": {"score": 0-100, "summary": "Mental wellness summary"},
      "body": {"score": 0-100, "summary": "Physical health summary (include BMI if available)"},
      "nutrition": {"score": 0-100, "summary": "Diet quality summary"},
      "sleep": {"score": 0-100, "summary": "Sleep quality summary"}
    },
    "insights": {
      "mainBarrier": "Biggest obstacle to wellness progress",
      "quickWin": "One simple high-impact change",
      "comparison": "Comparison with peers (e.g., 'Your sleep is lower than 70% of people your age')"
    }
  },
  "premiumReport": {
    "detailedAnalytics": {
      "metabolicAge": "Calculated metabolic age",
      "recoveryScore": "Ability to recover from stress and activity",
      "inflammationRisk": "Inflammation risk index from lifestyle & skin",
      "digitalWellnessScore": "Impact of screen time on sleep and stress"
    },
    "faceAnalysis": {
      "skinHealthScore": "Numeric score for skin health",
      "hydrationAssessment": "Skin hydration evaluation",
      "sleepDebtVisualization": "Signs of sleep debt (dark circles, eye bags)",
      "stressMarkers": "Visible stress markers (wrinkles, tension)"
    },
    "recommendations": {
      "circadianReset": "Personal sleep/wake optimization plan",
      "nutritionGaps": "Key nutrients missing in diet",
      "exercisePrescription": "Personalized exercise type & timing",
      "stressToolkit": "Recommended stress management techniques"
    },
    "forecasts": {
      "thirtyDayPotential": "Expected realistic improvements in 30 days",
      "riskTimeline": "Timeline of risks if habits continue",
      "habitStackingPlan": "Step-by-step habit introduction plan"
    },
    "uniqueFeatures": {
      "wellnessWeather": "7-day forecast of wellbeing",
      "energyMatrix": "Best times for focus & rest",
      "socialHealthScore": "Assessment of social wellbeing",
      "supplementStack": "Suggested supplements (with disclaimer)"
    },
    "aiCoachNotes": "Encouraging, personal closing message"
  }
}

IMPORTANT:
- Return ONLY valid JSON.
- Populate ALL fields with realistic, personalized content based on user data.
- Use numbers for numeric fields and plain text for descriptions.`;
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
      return { statusCode: 400, body: JSON.stringify({ status: 'error', message: 'Session ID required' }) };
    }

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();
    
    if (!doc.exists) {
      return { statusCode: 404, body: JSON.stringify({ status: 'error', message: 'Session not found' }) };
    }

    const sessionData = doc.data();

    if (sessionData.reportData) {
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'complete', data: sessionData.reportData })
      };
    }

    console.log('Generating new report with Gemini');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = createPrompt(sessionData.answers || {}, sessionData.faceAnalysis);

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
    
    const cleanedText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let reportData;
    try {
      reportData = JSON.parse(cleanedText);
    } catch (e) {
      console.error('Parse error, report not valid JSON:', e);
      throw e;
    }

    await sessionRef.update({ 
      reportData: reportData, 
      reportStatus: 'complete' 
    });

    console.log('Report saved successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'complete', data: reportData })
    };

  } catch (error) {
    console.error('Error generating report:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ status: 'error', message: 'Failed to generate report' })
    };
  }
};
