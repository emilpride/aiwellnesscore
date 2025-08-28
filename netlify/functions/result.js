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
    .map(([key, value]) => {
        // Исключаем отправку полного Data URL фотографии в промпт
        if (key === 'selfie' || key === 'faceAnalysis') return null;
        return `- ${key}: ${value}`;
    }).filter(Boolean).join('\n');

  const faceData = faceAnalysis ? `
  Face Analysis (non-medical indicators):
  - Apparent Age: ${faceAnalysis.age}
  - Gender: ${faceAnalysis.gender}
  - Emotions detected: ${JSON.stringify(faceAnalysis.emotion)}
  - Smile intensity (0 to 100): ${faceAnalysis.smile}
  - Glasses type: ${faceAnalysis.glasses}
  ` : 'Face analysis was skipped.';

  return `
    You are AI WELLNESSCORE, an expert AI wellness coach. Your goal is to provide a comprehensive, personalized, encouraging, and educational wellness report based on user data. This is NOT medical advice. All text must be in American English (en-US).

    User Data:
    ${quizData}
    ${faceData}

    Task: Generate a complete JSON object for the user's report with the following structure. Be creative, empathetic, and specific in your text descriptions. The JSON must be valid.

    {
      "freeReport": {
        "archetype": "A creative, metaphorical title for the user (e.g., 'Creative Owl', 'Urban Explorer').",
        "archetypeDescription": "A short, positive description of this archetype.",
        "wellnessScore": "An overall score from 1 to 100 based on all data.",
        "wellnessAge": "An estimated wellness age compared to their chronological age (which is in the user data).",
        "coreFourBreakdown": {
          "mind": {"score": 0-100, "summary": "Brief summary for the mind category."},
          "body": {"score": 0-100, "summary": "Brief summary for the body category."},
          "nutrition": {"score": 0-100, "summary": "Brief summary for the nutrition category."},
          "lifestyle": {"score": 0-100, "summary": "Brief summary for the lifestyle category."}
        },
        "keyInsight": "The single most important insight linking different data points (e.g., stress and sleep).",
        "firstStep": "One simple, concrete, actionable first step for immediate improvement.",
        "motivationTrigger": "An inspiring phrase based on the user's strengths.",
        "peerComparison": "A short, anonymous comparison to a similar demographic group (e.g., 'Your sleep metric is higher than 65% of users your age.')."
      },
      "premiumReport": {
        "deepDiveAnalysis": [
          {"metric": "Stress Recovery Index", "score": 0-100, "analysis": "Detailed analysis of stress and mindfulness habits."},
          {"metric": "Sleep Efficiency", "score": 0-100, "analysis": "Detailed analysis of sleep patterns."},
          {"metric": "Nutrient Intake Quality", "score": 0-100, "analysis": "Analysis of diet based on fruit/veg and processed food intake."}
        ],
        "fullPhotoAnalysis": "Detailed non-medical insights from the face analysis, connecting cues (like emotion scores) to lifestyle factors (like stress or sleep). If skipped, state that.",
        "sevenDayActionPlan": [
          {"day": 1, "task": "A specific, small task for day 1.", "focus": "Mind"},
          {"day": 2, "task": "A specific, small task for day 2.", "focus": "Nutrition"},
          {"day": 3, "task": "A specific, small task for day 3.", "focus": "Body"},
          {"day": 4, "task": "A specific, small task for day 4.", "focus": "Lifestyle"},
          {"day": 5, "task": "A specific, small task for day 5.", "focus": "Mind"},
          {"day": 6, "task": "A specific, small task for day 6.", "focus": "Nutrition"},
          {"day": 7, "task": "A specific, small task for day 7.", "focus": "Body"}
        ],
        "recommendationsLibrary": [
            {"type": "Recipe", "title": "Mind-Boosting Berry Smoothie", "description": "A quick recipe suggestion."},
            {"type": "Exercise", "title": "5-Minute Desk Stretch", "description": "A simple exercise routine."},
            {"type": "Meditation", "title": "3-Minute Breathing Exercise", "description": "A short audio meditation concept."}
        ],
        "longTermRisksAndOpportunities": "A forecast of how current habits might impact the future (e.g., risk of burnout) and the opportunities for improvement (e.g., managing risks).",
        "habitFormationIndex": "An assessment of the user's potential for forming new habits (e.g., 'Marathoner' or 'Sprinter') with a specific tip like the '2-Minute Rule'.",
        "aiCoachNotes": "A personal, encouraging note from the AI coach explaining a key pattern it noticed.",
        "scenarioSimulations": [
            {"scenario": "If you added 15 minutes of daily cardio...", "impact": "+3 points to your Body score."},
            {"scenario": "If you reduced alcohol intake by half...", "impact": "+4 points to your Lifestyle score."}
        ],
        "bmi": {"value": "Calculate the BMI based on height/weight data.", "interpretation": "A brief explanation of what the BMI value means and its limitations."},
        "wellnessTrajectoryForecast": "A projection of the Wellness Score over 1-5 years with current habits vs. with recommended changes."
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
    
    // ИСПОЛЬЗУЕМ НОВУЮ, БЫСТРУЮ МОДЕЛЬ
    const modelName = "gemini-2.5-flash";
    console.log(`Attempting to use Gemini model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    console.log('--- RAW RESPONSE FROM GEMINI ---', rawText);

    const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const reportData = JSON.parse(cleanedText);

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


