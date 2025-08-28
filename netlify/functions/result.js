const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Инициализация Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
let db;
if (!global._firebaseApp) {
  global._firebaseApp = initializeApp({ credential: cert(serviceAccount) });
}
db = getFirestore();

// Инициализация Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function createPrompt(answers, faceAnalysis) {
  const quizData = Object.entries(answers)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  const faceData = faceAnalysis ? `
  Face Analysis (non-medical indicators):
  - Apparent Age: ${faceAnalysis.age}
  - Gender: ${faceAnalysis.gender}
  - Emotions detected: ${JSON.stringify(faceAnalysis.emotion)}
  ` : 'Face analysis was skipped.';

  return `
    You are AI WELLNESSCORE, an AI wellness coach. Your goal is to provide a personalized, encouraging, and educational wellness report based on user data. This is NOT medical advice.

    User Data:
    ${quizData}

    ${faceData}

    Task: Generate a JSON object for the user's report with the following structure. Be creative and empathetic in your text descriptions.

    {
      "archetype": "A creative, metaphorical title for the user (e.g., 'Creative Owl', 'Urban Explorer').",
      "archetypeDescription": "A short, positive description of this archetype.",
      "wellnessScore": "An overall score from 1 to 100 based on all data.",
      "wellnessAge": "An estimated wellness age compared to their chronological age.",
      "keyInsight": "The single most important insight linking different data points (e.g., stress and sleep).",
      "firstStep": "One simple, actionable first step for immediate improvement.",
      "motivationTrigger": "An inspiring phrase based on the user's strengths.",
      "peerComparison": "A brief, anonymous comparison (e.g., 'Your sleep metric is higher than 65% of users...').",
      "coreFour": {
        "mind": {"score": 0-100, "summary": "Brief summary..."},
        "body": {"score": 0-100, "summary": "Brief summary..."},
        "nutrition": {"score": 0-100, "summary": "Brief summary..."},
        "lifestyle": {"score": 0-100, "summary": "Brief summary..."}
      }
    }
  `;
}

exports.handler = async (event) => {
  console.log('--- result.js function invoked ---');
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sessionId } = JSON.parse(event.body);
    console.log(`Received sessionId: ${sessionId}`);
    
    if (!sessionId) {
      console.error('Session ID is missing');
      return { statusCode: 400, body: 'Session ID is required' };
    }

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      console.error(`Session not found for ID: ${sessionId}`);
      return { statusCode: 404, body: 'Session not found' };
    }

    const sessionData = doc.data();
    console.log('Successfully fetched data from Firebase:', sessionData.answers);
    
    const faceAnalysisData = sessionData.faceAnalysis || null;
    console.log('Face analysis data:', faceAnalysisData ? 'Found' : 'Not found');

    const prompt = createPrompt(sessionData.answers, faceAnalysisData);
    console.log('--- PROMPT FOR GEMINI ---');
    console.log(prompt);
    console.log('-------------------------');

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    console.log('--- RAW RESPONSE FROM GEMINI ---');
    console.log(rawText);
    console.log('------------------------------');

    let reportData;
    try {
        // Попытка очистить и распарсить JSON
        const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        reportData = JSON.parse(cleanedText);
        console.log('Successfully parsed Gemini response into JSON.');
    } catch (parseError) {
        console.error('Failed to parse Gemini response as JSON:', parseError);
        throw new Error('Invalid JSON response from AI model.');
    }

    return {
      statusCode: 200,
      body: JSON.stringify(reportData),
    };

  } catch (error) {
    console.error('--- ERROR in result.js handler ---');
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
    };
  }
};

