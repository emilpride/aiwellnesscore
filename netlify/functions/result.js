const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
let db;
if (!global._firebaseApp) {
  global._firebaseApp = initializeApp({ credential: cert(serviceAccount) });
}
db = getFirestore();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function createPrompt(answers, faceAnalysis) {
  const quizData = Object.entries(answers)
    .map(([key, value]) => {
        if (key === 'selfie' || key === 'faceAnalysis') return null;
        return `- ${key}: ${value}`;
    }).filter(Boolean).join('\n');

  const faceData = faceAnalysis ? `
  Face Analysis (non-medical indicators):
  - Apparent Age: ${faceAnalysis.age}
  - Gender: ${faceAnalysis.gender}
  - Smile detected: ${faceAnalysis.smile}
  - Glasses type: ${faceAnalysis.glasses}
  - Emotions detected: ${JSON.stringify(faceAnalysis.emotion)}
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);
    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      return { statusCode: 404, body: 'Session not found' };
    }

    const sessionData = doc.data();
    const faceAnalysisData = sessionData.faceAnalysis || null;

    const prompt = createPrompt(sessionData.answers, faceAnalysisData);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    console.log('--- RAW RESPONSE FROM GEMINI ---', rawText);

    const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const reportData = JSON.parse(cleanedText);

    if (!reportData.freeReport || !reportData.freeReport.coreFour) {
        throw new Error("AI response is missing critical data (freeReport or coreFour).");
    }

    return {
      statusCode: 200,
      body: JSON.stringify(reportData),
    };

  } catch (error) {
    console.error('--- ERROR in result.js handler ---', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
    };
  }
};
