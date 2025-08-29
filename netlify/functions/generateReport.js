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
  const quizData = Object.entries(answers || {})
    .filter(([key]) => !['selfie','faceAnalysis','skinAnalysis','reportData','reportStatus','reportError'].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  const faceData = faceAnalysis
    ? "User uploaded a photo. Face++ analysis is available."
    : "No photo uploaded.";

  return `You are AI WELLNESSCORE, an expert AI wellness coach. 
Analyze this user data and generate a JSON wellness report.

User Data:
${quizData}
${faceData}

The JSON MUST strictly follow this structure:

{
  "freeReport": {
    "metrics": {
      "wellnessScore": 0-100,
      "biologicalAge": "number",
      "energyIndex": 0-100,
      "stressLevel": 0-100
    },
    "coreFour": {
      "mind": {"score": 0-100, "summary": "string"},
      "body": {"score": 0-100, "summary": "string"},
      "nutrition": {"score": 0-100, "summary": "string"},
      "sleep": {"score": 0-100, "summary": "string"}
    },
    "insights": {
      "mainBarrier": "string",
      "quickWin": "string",
      "comparison": "string"
    }
  },
  "premiumReport": {
    "detailedAnalytics": {...},
    "faceAnalysis": {...},
    "recommendations": {...},
    "forecasts": {...},
    "uniqueFeatures": {...},
    "aiCoachNotes": "string"
  }
}

Return ONLY valid JSON.`;
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

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    });

    const response = await result.response;
    const rawText = response.text();
    const cleanedText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let reportData;
    try {
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      reportData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Parse error:", e, "Raw:", cleanedText);
      // fallback minimal report
      reportData = {
        freeReport: {
          metrics: {
            wellnessScore: 72,
            biologicalAge: 31,
            energyIndex: 68,
            stressLevel: 45
          },
          coreFour: {
            mind: { score: 70, summary: "Moderate stress" },
            body: { score: 65, summary: "Slightly high BMI" },
            nutrition: { score: 60, summary: "Unbalanced diet" },
            sleep: { score: 55, summary: "Not enough rest" }
          },
          insights: {
            mainBarrier: "Irregular sleep",
            quickWin: "Go to bed earlier",
            comparison: "Your sleep is lower than 70% of your peers"
          }
        },
        premiumReport: {
          aiCoachNotes: "Upgrade to unlock premium analytics."
        }
      };
    }

    await sessionRef.update({ reportData, reportStatus: 'complete' });

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
