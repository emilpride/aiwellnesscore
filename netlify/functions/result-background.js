// /netlify/functions/result-background.js - ОБЪЕДИНЕННАЯ И УЛУЧШЕННАЯ ВЕРСИЯ

'use strict';

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Инициализация Firebase (безопасно для serverless)
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    [cite_start]initializeApp({ credential: cert(serviceAccount) }); [cite: 40]
  } catch (e) {
    console.error("Firebase init error (result-background):", e);
  }
}

const db = getFirestore();
[cite_start]const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); [cite: 126]

/**
 * Промпт из generateReport.js - он более детальный и структурированный
 */
function createPrompt(answers = {}, faceAnalysis) {
  const quizData = Object.entries(answers)
    [cite_start].filter(([k]) => !['selfie','faceAnalysis','skinAnalysis','reportData','reportStatus','reportError'].includes(k)) [cite: 44]
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || [cite_start]"No quiz answers provided."; [cite: 44]

  const faceData = faceAnalysis ? [cite_start]`Face++ analysis available: ${JSON.stringify(faceAnalysis)}` : "No face photo provided."; [cite: 45]
  
  // ТОЧНАЯ СХЕМА ИЗ generateReport.js
  return `
[cite_start]You are AI WELLNESSCORE, a professional wellness coach and data scientist. [cite: 46]
[cite_start]Using the user-provided quiz answers and optional Face++ photo analysis, produce a single VALID JSON object that matches exactly the schema specified below. [cite: 46]
[cite_start]Do NOT output any explanatory text, markdown, or content outside the JSON object. [cite: 47]
User data:
${quizData}
${faceData}

REQUIRED JSON SCHEMA (return only this object, exact keys):

{
  "freeReport": {
    "metrics": {
      "wellnessScore": number,            // 0-100
      "biologicalAge": number,            // integer years
      "energyIndex": number,              // 0-100
      "stressLevel": number               // 0-100
    },
    "coreFour": {
      "mind": {"score": number, "summary": string},
      "body": {"score": number, "summary": string, "bmi": number | null},
      "nutrition": {"score": number, "summary": string, "fruitsVegPerDay": number | null, "processedFoodLevel": string | null, "waterLiters": number | null},
      "sleep": {"score": number, "summary": string, "hours": number | null, "visualSigns": string | null}
    },
    "insights": {
      "mainBarrier": string,
      "quickWin": string,
      "comparison": string
    }
  },
  "premiumReport": {
    "detailedAnalytics": {
      "metabolicAge": number,
      "recoveryScore": number,
      "inflammationRiskIndex": number,
      "digitalWellnessScore": number
    },
    "faceAnalysis": {
      "skinHealthScore": number,
      "hydrationAssessment": string,
      "sleepDebtVisualization": string,
      "stressMarkers": string
    },
    "recommendations": {
      "circadianReset": {"bedtime": "HH:MM", "wakeTime": "HH:MM", "steps": [string]},
      "nutritionGaps": [ {"nutrient": string, "why": string} ],
      "exercisePrescription": {"type": string, "durationMin": number, "timeOfDay": string},
      "stressToolkit": [ string ]
    },
    "forecasts": {
      "thirtyDayPotential": {"expectedWellnessScoreIncrease": number, "notes": string},
      "riskTimeline": [ {"yearsFromNow": number, "risk": string} ],
      "habitStackingPlan": [ {"week": number, "habit": string} ]
    },
    "uniqueFeatures": {
      "wellnessWeather": [ {"day": string, "forecast": string, "scoreModifier": number} ],
      "energyMatrix": [ {"timeRange": string, "recommendedTask": string, "intensity": string} ],
      "socialHealthScore": number,
      "personalizedSupplementStack": [ {"name": string, "reason": string, "dose": string} ]
    },
    "aiCoachNotes": string
  }
}

IMPORTANT:
- [cite_start]Use numbers for numeric fields (no strings for numbers). [cite: 55]
- [cite_start]If some subfields are not available, return null for numeric and a short explanatory string or empty string for textual fields — but keep the keys. [cite: 55]
- Keep the report concise and personalized using the provided quiz data. [cite_start]Return only one JSON object. [cite: 56]
`;
}

/**
 * Функция-фолбэк из generateReport.js - для максимальной надежности
 */
function buildFallback(sessionData = {}, faceAnalysis = null) {
  const answers = sessionData.answers || [cite_start]{}; [cite: 59-60]
  [cite_start]let height = null, weight = null, age = null; [cite: 60]
  try {
    [cite_start]if (answers.height) height = parseFloat(answers.height); [cite: 61]
    [cite_start]if (answers.weight) weight = parseFloat(answers.weight); [cite: 61]
    [cite_start]if (answers.age) age = parseInt(answers.age); [cite: 61]
  [cite_start]} catch(e){} [cite: 62]

  const bmi = (height && weight && height > 0) ? [cite_start]+(weight / ((height/100)*(height/100))).toFixed(1) : null; [cite: 62]
  const face = faceAnalysis || [cite_start]{}; [cite: 63]
  [cite_start]const estimatedVisualAge = face.age || null; [cite: 63]
  const biologicalAgeEst = estimatedVisualAge ? [cite_start]Math.round((estimatedVisualAge + (age || estimatedVisualAge))/2) : (age || 35); [cite: 64]

  [cite_start]const wellnessScore = 60 + (bmi && bmi < 25 ? 5 : 0) + (face && face.smile ? 3 : 0); [cite: 64]
  [cite_start]const energyIndex = 60; [cite: 65]
  [cite_start]const stressLevel = 45; [cite: 65]

  return {
    freeReport: {
      metrics: {
        wellnessScore: Math.min(100, Math.round(wellnessScore)),
        biologicalAge: biologicalAgeEst,
        energyIndex: energyIndex,
        stressLevel: stressLevel
      },
      coreFour: {
        mind: { score: 65, summary: "Moderate stress; some mindfulness would help" },
        [cite_start]body: { score: 62, summary: "Some activity but inconsistent", bmi: bmi }, [cite: 66]
        nutrition: { score: 60, summary: "Low fruit/veg intake and occasional processed foods", fruitsVegPerDay: 2, processedFoodLevel: "Moderate", waterLiters: 1.6 },
        sleep: { score: 55, summary: "Typical short sleep windows; signs of sleep debt", hours: answers.sleepHours ? Number(answers.sleepHours) : null, visualSigns: face && face.emotion ? [cite_start]"Mild under-eye darkness" : null } [cite: 67]
      },
      insights: {
        mainBarrier: "Irregular sleep and inconsistent daily routine",
        quickWin: "Start a 30-minute wind-down routine 30 minutes before bed",
        comparison: "Your sleep is lower than approximately 70% of people in your age group"
      }
    },
    premiumReport: {
      [cite_start]detailedAnalytics: { [cite: 68]
        metabolicAge: Math.max(20, (biologicalAgeEst ? biologicalAgeEst : 35) + 2),
        recoveryScore: 58,
        inflammationRiskIndex: 40,
        digitalWellnessScore: 55
      },
      faceAnalysis: {
        skinHealthScore: face.skinHealthScore || [cite_start]62, [cite: 69]
        [cite_start]hydrationAssessment: face.hydration ? face.hydration : "Slightly dehydrated signs", [cite: 69-70]
        sleepDebtVisualization: face.underEyeDarkness ? [cite_start]"Visible under-eye shadowing" : "Mild", [cite: 70-71]
        stressMarkers: face.frownLines ? [cite_start]"Mild forehead lines" : "Minimal" [cite: 71-72]
      },
      recommendations: {
        circadianReset: { bedtime: "22:30", wakeTime: "06:30", steps: ["Dim screens after 21:30","Morning sunlight exposure","Consistent bedtime"] },
        nutritionGaps: [{ nutrient: "Vitamin D", why: "Low sunlight exposure or dietary intake" }, { nutrient: "Omega-3", why: "Low oily fish intake" }],
        exercisePrescription: { type: "Brisk walking + 2 strength sessions", durationMin: 30, timeOfDay: "Morning or early afternoon" },
        [cite_start]stressToolkit: ["4-7-8 breathing", "10-minute daily mindfulness", "Short walks after work"] [cite: 73]
      },
      forecasts: {
        thirtyDayPotential: { expectedWellnessScoreIncrease: 6, notes: "With consistent sleep and one nutrition change" },
        riskTimeline: [{ yearsFromNow: 5, risk: "Increased cardiometabolic risk if sleep and activity stay low" }],
        habitStackingPlan: [{ week: 1, habit: "Bedtime routine" }, { week: 2, habit: "Add morning walk" }]
      },
      [cite_start]uniqueFeatures: { [cite: 74]
        wellnessWeather: [
          { day: "Mon", forecast: "Good", scoreModifier: 1 },
          { day: "Tue", forecast: "Moderate", scoreModifier: 0 },
          { day: "Wed", forecast: "Good", scoreModifier: 1 },
          { day: "Thu", forecast: "Low", scoreModifier: -1 },
          { day: "Fri", forecast: "Moderate", scoreModifier: 0 },
          [cite_start]{ day: "Sat", forecast: "Good", scoreModifier: 1 }, [cite: 75]
          { day: "Sun", forecast: "Rest", scoreModifier: 2 }
        ],
        energyMatrix: [
          { timeRange: "06:00-09:00", recommendedTask: "High-focus work", intensity: "High" },
          { timeRange: "12:00-14:00", recommendedTask: "Light tasks / walk", intensity: "Low" }
        ],
        [cite_start]socialHealthScore: 66, [cite: 76]
        personalizedSupplementStack: [
          { name: "Vitamin D", reason: "Low levels / mood support", dose: "1000 IU daily" },
          { name: "Omega-3", reason: "Support inflammation control", dose: "1000 mg daily" }
        ]
      },
      [cite_start]aiCoachNotes: "This is a fallback summary. Upgrade to Premium to unlock personalized, data-driven details." [cite: 77]
    }
  };
}


async function generateAndSaveReport(sessionRef, sessionId) {
  try {
    const doc = await sessionRef.get();
    [cite_start]if (!doc.exists) throw new Error(`Session ${sessionId} not found.`); [cite: 144]
    
    await sessionRef.update({ reportStatus: 'processing' });

    const sessionData = doc.data();
    const faceAnalysisData = sessionData.faceAnalysis || null;
    const prompt = createPrompt(sessionData.answers, faceAnalysisData);
    
    // Используем более мощную модель для сложного JSON
    [cite_start]const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); [cite: 146]
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
    });
    
    const response = await result.response;
    const rawText = response.text ? response.text() : "";
    if (!rawText || rawText.trim().length === 0) {
      throw new Error("Empty response from model");
    }

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/gi, '').trim();
    let reportData;
    
    try {
      [cite_start]const jsonMatch = cleaned.match(/\{[\s\S]*\}$/); [cite: 87]
      [cite_start]if (!jsonMatch) throw new Error("No JSON object detected in model output"); [cite: 87]
      reportData = JSON.parse(jsonMatch[0]);
      [cite_start]if (!reportData.freeReport || !reportData.freeReport.metrics || typeof reportData.freeReport.metrics.wellnessScore === 'undefined') { [cite: 88]
        [cite_start]throw new Error("Required keys missing from parsed JSON"); [cite: 88]
      }
    } catch (parseErr) {
      console.error("Parse error, falling back:", parseErr);
      reportData = buildFallback(sessionData, faceAnalysisData);
    }

    [cite_start]await sessionRef.update({ reportData, reportStatus: 'complete' }); [cite: 92]
    console.log(`Report successfully generated for sessionId: ${sessionId}`);
  } catch (error) {
    [cite_start]console.error(`--- ERROR in background generation for sessionId: ${sessionId} ---`, error); [cite: 149]
    [cite_start]await sessionRef.update({ reportStatus: 'error', reportError: error.message }); [cite: 150]
  }
}

// Основной обработчик Netlify
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    [cite_start]return { statusCode: 405, body: 'Method Not Allowed' }; [cite: 139]
  }

  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) {
      return { statusCode: 400, body: 'Session ID is required' };
    }
    
    [cite_start]const sessionRef = db.collection('sessions').doc(sessionId); [cite: 140]
    // Запускаем генерацию в фоне, но не ждем ее завершения
    [cite_start]generateAndSaveReport(sessionRef, sessionId); [cite: 140]
    
    // Сразу возвращаем ответ, что задача принята
    return {
      statusCode: 202, // Accepted
      body: JSON.stringify({ message: 'Report generation started' })
    };
  } catch (e) {
    console.error("Error in handler:", e);
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
  }
};
