const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Инициализация Firebase
try {
  if (!global._firebaseApp) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    global._firebaseApp = initializeApp({ credential: cert(serviceAccount) });
  }
} catch (e) {
  console.error("Firebase initialization error in result.js:", e);
}

const db = getFirestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Функция createPrompt остается без изменений
function createPrompt(answers, faceAnalysis) {
  const quizData = Object.entries(answers)
    .map(([key, value]) => {
      if (key === 'selfie' || key === 'faceAnalysis' || key === 'skinAnalysis' || key === 'reportData') return null;
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

  // ... (остальной код createPrompt как был)
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

// Главная функция-обработчик
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

    // Запускаем генерацию в фоновом режиме и НЕ ждем ее завершения
    generateAndSaveReport(sessionRef, doc.data());

    // Немедленно возвращаем ответ, что процесс запущен
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'processing' }),
    };

  } catch (error) {
    console.error('--- ERROR in result.js handler ---', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
    };
  }
};

// Асинхронная функция для долгой работы
async function generateAndSaveReport(sessionRef, sessionData) {
  try {
    const faceAnalysisData = sessionData.faceAnalysis || sessionData.skinAnalysis || null;
    const prompt = createPrompt(sessionData.answers, faceAnalysisData);
    
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const reportData = JSON.parse(cleanedText);

    if (!reportData.freeReport || !reportData.freeReport.coreFour) {
        throw new Error("AI response is missing critical data (freeReport or coreFour).");
    }

    // Сохраняем готовый отчет в Firestore
    await sessionRef.update({ reportData: reportData });
    console.log(`Report successfully generated and saved for sessionId: ${sessionRef.id}`);

  } catch (error) {
    console.error(`--- ERROR in background report generation for sessionId: ${sessionRef.id} ---`, error);
    // Можно также записать ошибку в Firestore, чтобы клиент о ней узнал
    await sessionRef.update({ reportError: error.message });
  }
}
