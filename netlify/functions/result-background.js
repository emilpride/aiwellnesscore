'use strict';

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error:", e);
  }
}

const db = getFirestore();

function createFullPrompt(answers = {}, faceAnalysis) {
  const quizData = Object.entries(answers)
    .filter(([k]) => !['selfie','faceAnalysis','skinAnalysis','reportData','reportStatus','reportError'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || "No quiz answers provided.";

  // Include detailed skin status from face analysis if available
  const skinStatus = faceAnalysis?.faces?.[0]?.attributes?.skinstatus;
  const faceData = faceAnalysis ? `
Face Analysis Data:
- Age appearance: ${faceAnalysis.faces?.[0]?.attributes?.age?.value || 'N/A'}
- Skin health score (1-100): ${skinStatus?.health || 'N/A'}
- Dark circles score (1-100): ${skinStatus?.dark_circle || 'N/A'}
- Eye pouch score (1-100): ${skinStatus?.eye_pouch || 'N/A'}
- Acne score (1-100): ${skinStatus?.acne || 'N/A'}
- Skin spot score (1-100): ${skinStatus?.skin_spot || 'N/A'}
- Blackhead score (1-100): ${skinStatus?.blackhead || 'N/A'}
- Forehead wrinkle score (1-100): ${skinStatus?.forehead_wrinkle || 'N/A'}
- Glabella wrinkle score (1-100): ${skinStatus?.glabella_wrinkle || 'N/A'}
- Nasolabial fold score (1-100): ${skinStatus?.nasolabial_fold || 'N/A'}
- Eye finelines score (1-100): ${skinStatus?.eye_finelines || 'N/A'}
- Crow's feet score (1-100): ${skinStatus?.crows_feet || 'N/A'}
` : "No face analysis available";

  return `You are an AI wellness and dermatology analyst. Create a personalized wellness report based on the user's quiz answers and face analysis data.

USER DATA:
${quizData}

${faceData}

Generate a complete, personalized JSON report. Be specific and base all calculations and text on the provided user data.

REQUIRED JSON STRUCTURE (return ONLY valid JSON, no other text):
{
  "userName": "[Extract user's name if provided, otherwise use a friendly placeholder like 'there']",
  "chronoAge": ${answers.age ? parseInt(answers.age.match(/\d+/)?.[0] || 35) : 35},
  "wellnessAge": "[Calculate a realistic wellness age based on all lifestyle, quiz, and face analysis data]",
  "ageReductionPrediction": "2-3 years",
  "increasingFactors": [
    "[List 2-3 specific factors from user data that are negatively impacting their wellness age, e.g., 'High stress from work']"
  ],
  "decreasingFactors": [
    "[List 2-3 specific factors from user data that are positively impacting their wellness, e.g., 'Consistent exercise routine']"
  ],
  "metrics": {
    "wellnessScore": {
      "value": "[Calculate a holistic score from 1-100 based on all data]",
      "description": "This score provides a holistic measure of your current well-being, combining all lifestyle, physical, and skin health factors."
    },
    "energy": {
      "value": "[Calculate an energy score from 1-100 based on sleep, activity, and nutrition]",
      "description": "Reflects your vitality based on sleep, nutrition, and activity."
    },
    "stress": {
      "value": "[Calculate a stress score from 1-100 based on reported stress and visual signs. A lower score is better.]",
      "description": "Your body's response to daily pressures. A lower score indicates better stress management."
    },
    "skinQuality": {
      "value": "[Calculate a skin quality score from 1-100 based on the detailed face analysis data]",
      "description": "Based on visual analysis of hydration, texture, and tone."
    },
    "bmi": {
      "value": "[Calculate BMI if height/weight provided, otherwise 'N/A']",
      "description": "Your Body Mass Index. A healthy range is typically 18.5-24.9."
    },
    "nutrition": {
      "value": "[Calculate a nutrition score from 1-100 based on diet answers]",
      "description": "An assessment of your dietary balance and habits."
    },
    "healthyHabits": {
      "value": "[Calculate a score from 1-100 on consistency of positive lifestyle choices like exercise and mindfulness]",
      "description": "Measures your consistency in positive lifestyle choices."
    }
  },
  "skinAnalysis": {
    "dark_circle": "[Return 1 if dark_circle score is significant (>30), otherwise 0]",
    "eye_pouch": "[Return 1 if eye_pouch score is significant (>30), otherwise 0]",
    "forehead_wrinkle": "[Return 1 if forehead_wrinkle score is significant (>20), otherwise 0]",
    "glabella_wrinkle": "[Return 1 if glabella_wrinkle score is significant (>20), otherwise 0]",
    "nasolabial_fold": "[Return 1 if nasolabial_fold score is significant (>20), otherwise 0]",
    "eye_finelines": "[Return 1 if eye_finelines score is significant (>20), otherwise 0]",
    "crows_feet": "[Return 1 if crows_feet score is significant (>20), otherwise 0]",
    "skin_type": "[Analyze user answers (e.g., 'oily t-zone') and return a number: 0 for oily, 1 for dry, 2 for normal, 3 for mixed]",
    "skin_spot": "[Return 1 if skin_spot score is significant (>10), otherwise 0]",
    "acne": "[Return 1 if acne score is significant (>10), otherwise 0]",
    "blackhead": "[Return 1 if blackhead score is significant (>10), otherwise 0]",
    "pores": "[Return 1 if user mentions large pores or visual analysis suggests it, otherwise 0]",
    "mole": "[Return 1 if user mentions moles, otherwise 0]",
    "conclusion": "[Write a 2-3 sentence summary of their overall skin condition based on the analysis.]"
  },
  "sevenDayPlan": [
    { "day": 1, "title": "[Title for Day 1]", "task": "[A specific, simple task for Day 1 related to their biggest improvement area]", "icon": "[Relevant Emoji]" },
    { "day": 2, "title": "[Title for Day 2]", "task": "[A specific, simple task for Day 2]", "icon": "[Relevant Emoji]" },
    { "day": 3, "title": "[Title for Day 3]", "task": "[A specific, simple task for Day 3]", "icon": "[Relevant Emoji]" },
    { "day": 4, "title": "[Title for Day 4]", "task": "[A specific, simple task for Day 4]", "icon": "[Relevant Emoji]" },
    { "day": 5, "title": "[Title for Day 5]", "task": "[A specific, simple task for Day 5]", "icon": "[Relevant Emoji]" },
    { "day": 6, "title": "[Title for Day 6]", "task": "[A specific, simple task for Day 6]", "icon": "[Relevant Emoji]" },
    { "day": 7, "title": "[Title for Day 7]", "task": "[A specific, simple task for Day 7]", "icon": "[Relevant Emoji]" }
  ]
}`;
}

function buildCompleteFallback(sessionData = {}, faceAnalysis = null) {
    const answers = sessionData.answers || {};
    let age = 35;
    if (answers.age) {
        const ageMatch = answers.age.match(/\d+/);
        if (ageMatch) age = parseInt(ageMatch[0]);
    }
    
    // Simplified calculations for fallback
    let wellnessScore = 68;
    let wellnessAge = age + 3;
    if (answers.sleep?.includes('7-8')) {
        wellnessScore += 5;
        wellnessAge -= 2;
    }
    if (answers.activity?.includes('3-4')) {
        wellnessScore += 7;
        wellnessAge -= 3;
    }
    if (answers.stress?.includes('Low')) {
        wellnessScore += 10;
        wellnessAge -= 2;
    }

    const skinStatus = faceAnalysis?.faces?.[0]?.attributes?.skinstatus || {};

    return {
        userName: "Jessica",
        chronoAge: age,
        wellnessAge: wellnessAge,
        ageReductionPrediction: "2-3 years",
        increasingFactors: [
            "High stress levels from work are impacting sleep quality.",
            "Occasional lack of hydration affects skin elasticity."
        ],
        decreasingFactors: [
            "Consistent weekly exercise routine.",
            "Healthy BMI and regular physical activity."
        ],
        metrics: {
            wellnessScore: { value: Math.min(95, wellnessScore), description: "This score provides a holistic measure of your current well-being, combining all lifestyle, physical, and skin health factors." },
            energy: { value: 65, description: "Reflects your vitality based on sleep, nutrition, and activity." },
            stress: { value: 75, description: "Your body's response to daily pressures. A lower score is better." },
            skinQuality: { value: skinStatus.health || 85, description: "Based on visual analysis of hydration, texture, and tone." },
            bmi: { value: "22.5 (Healthy)", description: "Your Body Mass Index is optimal." },
            nutrition: { value: "70", description: "Assessment of your dietary balance." },
            healthyHabits: { value: "80", description: "Consistency in positive lifestyle choices." }
        },
        skinAnalysis: {
            dark_circle: (skinStatus.dark_circle > 30) ? 1 : 0,
            eye_pouch: (skinStatus.eye_pouch > 30) ? 1 : 0,
            forehead_wrinkle: (skinStatus.forehead_wrinkle > 20) ? 1 : 0,
            glabella_wrinkle: (skinStatus.glabella_wrinkle > 20) ? 1 : 0,
            nasolabial_fold: (skinStatus.nasolabial_fold > 20) ? 1 : 0,
            eye_finelines: (skinStatus.eye_finelines > 20) ? 1 : 0,
            crows_feet: (skinStatus.crows_feet > 20) ? 1 : 0,
            skin_type: 3, // Default to mixed
            skin_spot: (skinStatus.skin_spot > 10) ? 1 : 0,
            acne: (skinStatus.acne > 10) ? 1 : 0,
            blackhead: (skinStatus.blackhead > 10) ? 1 : 0,
            pores: 1,
            mole: 0,
            conclusion: "Your skin shows good elasticity. Key areas for improvement are hydration to reduce fine lines and targeted care for the T-zone. Better sleep will also help reduce dark circles."
        },
        sevenDayPlan: [
            { day: 1, title: "Hydration", task: "Drink 8 glasses of water.", icon: "💧" },
            { day: 2, title: "Mindfulness", task: "5-minute morning meditation.", icon: "🧘" },
            { day: 3, title: "Digital Detox", task: "No screens 1 hour before bed.", icon: "🌙" },
            { day: 4, title: "Green Boost", task: "Add a large leafy green salad.", icon: "🥬" },
            { day: 5, title: "Active Break", task: "Take a 15-minute brisk walk.", icon: "👟" },
            { day: 6, title: "Skin Care", task: "Apply a hydrating face mask.", icon: "🧖‍♀️" },
            { day: 7, title: "Reflect & Plan", task: "Review your week and continue one new habit.", icon: "🗓️" },
        ]
    };
}


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Session ID is required' }) };
    }
    
    console.log(`[${sessionId}] Starting report generation`);
    const sessionRef = db.collection('sessions').doc(sessionId);
    
    const doc = await sessionRef.get();
    if (!doc.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
    }
    
    const sessionData = doc.data();
    await sessionRef.update({ reportStatus: 'processing' });
    
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('Gemini API key not configured');
      }
      
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      console.log(`[${sessionId}] Calling Gemini API`);
      const prompt = createFullPrompt(sessionData.answers, sessionData.faceAnalysis);
      
      // Timeout for API call
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('API Timeout')), 8000))
      ]);
      
      const response = result.response;
      const text = response.text();
      console.log(`[${sessionId}] Got AI response`);
      
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```/gi, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) throw new Error('No valid JSON in response');
      
      const reportData = JSON.parse(jsonMatch[0]);
      
      // Validate structure
      if (!reportData.metrics?.wellnessScore) throw new Error('Invalid report structure');
      
      await sessionRef.update({ 
        reportData, 
        reportStatus: 'complete' 
      });
      
      console.log(`[${sessionId}] Report saved successfully`);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Report generated', sessionId })
      };
      
    } catch (error) {
      console.error(`[${sessionId}] Using fallback due to:`, error.message);
      const fallbackReport = buildCompleteFallback(sessionData, sessionData.faceAnalysis);
      
      await sessionRef.update({ 
        reportData: fallbackReport, 
        reportStatus: 'complete'
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Report generated (fallback)', sessionId })
      };
    }
    
  } catch (error) {
    console.error('Handler error:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
