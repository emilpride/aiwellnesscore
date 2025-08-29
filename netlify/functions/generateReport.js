// /netlify/functions/generateReport.js
'use strict';

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error (generateReport):", e);
  }
}

const db = getFirestore();

/**
 * Build the strict prompt that requests exactly the JSON structure matching the product spec.
 * The assistant MUST return a single JSON object and nothing else.
 */
function createPrompt(answers = {}, faceAnalysis) {
  const quizData = Object.entries(answers)
    .filter(([k]) => !['selfie','faceAnalysis','skinAnalysis','reportData','reportStatus','reportError'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || "No quiz answers provided.";

  const faceData = faceAnalysis ? `Face++ analysis available: ${JSON.stringify(faceAnalysis)}` : "No face photo provided.";

  return `
You are AI WELLNESSCORE, a professional wellness coach and data scientist. Using the user-provided quiz answers and optional Face++ photo analysis, produce a single VALID JSON object that matches exactly the schema specified below. Do NOT output any explanatory text, markdown, or content outside the JSON object.

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
- Use numbers for numeric fields (no strings for numbers).
- If some subfields are not available, return null for numeric and a short explanatory string or empty string for textual fields — but keep the keys.
- Keep the report concise and personalized using the provided quiz data. Return only one JSON object.
`;
}

/**
 * Build a robust fallback that covers the full schema.
 * Uses session answers and faceAnalysis (if available) to populate plausible defaults.
 */
function buildFallback(sessionData = {}, faceAnalysis = null) {
  // small helper to parse height/weight if exists
  const answers = sessionData.answers || {};
  let height = null, weight = null, age = null;
  try {
    if (answers.height) height = parseFloat(answers.height);
    if (answers.weight) weight = parseFloat(answers.weight);
    if (answers.age) age = parseInt(answers.age);
  } catch(e){}

  const bmi = (height && weight && height > 0) ? +(weight / ((height/100)*(height/100))).toFixed(1) : null;

  const face = faceAnalysis || {};
  const estimatedVisualAge = face.age || null;
  const biologicalAgeEst = estimatedVisualAge ? Math.round((estimatedVisualAge + (age || estimatedVisualAge))/2) : (age || 35);

  const wellnessScore = 60 + (bmi && bmi < 25 ? 5 : 0) + (face && face.smile ? 3 : 0);
  const energyIndex = 60;
  const stressLevel = 45;

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
        body: { score: 62, summary: "Some activity but inconsistent", bmi: bmi },
        nutrition: { score: 60, summary: "Low fruit/veg intake and occasional processed foods", fruitsVegPerDay: 2, processedFoodLevel: "Moderate", waterLiters: 1.6 },
        sleep: { score: 55, summary: "Typical short sleep windows; signs of sleep debt", hours: answers.sleepHours ? Number(answers.sleepHours) : null, visualSigns: face && face.emotion ? "Mild under-eye darkness" : null }
      },
      insights: {
        mainBarrier: "Irregular sleep and inconsistent daily routine",
        quickWin: "Start a 30-minute wind-down routine 30 minutes before bed",
        comparison: "Your sleep is lower than approximately 70% of people in your age group"
      }
    },
    premiumReport: {
      detailedAnalytics: {
        metabolicAge: Math.max(20, (biologicalAgeEst ? biologicalAgeEst : 35) + 2),
        recoveryScore: 58,
        inflammationRiskIndex: 40,
        digitalWellnessScore: 55
      },
      faceAnalysis: {
        skinHealthScore: face.skinHealthScore || 62,
        hydrationAssessment: face.hydration ? face.hydration : "Slightly dehydrated signs",
        sleepDebtVisualization: face.underEyeDarkness ? "Visible under-eye shadowing" : "Mild",
        stressMarkers: face.frownLines ? "Mild forehead lines" : "Minimal"
      },
      recommendations: {
        circadianReset: { bedtime: "22:30", wakeTime: "06:30", steps: ["Dim screens after 21:30","Morning sunlight exposure","Consistent bedtime"] },
        nutritionGaps: [{ nutrient: "Vitamin D", why: "Low sunlight exposure or dietary intake" }, { nutrient: "Omega-3", why: "Low oily fish intake" }],
        exercisePrescription: { type: "Brisk walking + 2 strength sessions", durationMin: 30, timeOfDay: "Morning or early afternoon" },
        stressToolkit: ["4-7-8 breathing", "10-minute daily mindfulness", "Short walks after work"]
      },
      forecasts: {
        thirtyDayPotential: { expectedWellnessScoreIncrease: 6, notes: "With consistent sleep and one nutrition change" },
        riskTimeline: [{ yearsFromNow: 5, risk: "Increased cardiometabolic risk if sleep and activity stay low" }],
        habitStackingPlan: [{ week: 1, habit: "Bedtime routine" }, { week: 2, habit: "Add morning walk" }]
      },
      uniqueFeatures: {
        wellnessWeather: [
          { day: "Mon", forecast: "Good", scoreModifier: 1 },
          { day: "Tue", forecast: "Moderate", scoreModifier: 0 },
          { day: "Wed", forecast: "Good", scoreModifier: 1 },
          { day: "Thu", forecast: "Low", scoreModifier: -1 },
          { day: "Fri", forecast: "Moderate", scoreModifier: 0 },
          { day: "Sat", forecast: "Good", scoreModifier: 1 },
          { day: "Sun", forecast: "Rest", scoreModifier: 2 }
        ],
        energyMatrix: [
          { timeRange: "06:00-09:00", recommendedTask: "High-focus work", intensity: "High" },
          { timeRange: "12:00-14:00", recommendedTask: "Light tasks / walk", intensity: "Low" }
        ],
        socialHealthScore: 66,
        personalizedSupplementStack: [
          { name: "Vitamin D", reason: "Low levels / mood support", dose: "1000 IU daily" },
          { name: "Omega-3", reason: "Support inflammation control", dose: "1000 mg daily" }
        ]
      },
      aiCoachNotes: "This is a fallback summary. Upgrade to Premium to unlock personalized, data-driven details."
    }
  };
}

exports.handler = async (event) => {
  console.log('generateReport called');

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let sessionId;
  try {
    const { sessionId: sId } = JSON.parse(event.body || '{}');
    sessionId = sId;
    if (!sessionId) {
      return { statusCode: 400, body: JSON.stringify({ status: 'error', message: 'Session ID required' }) };
    }
  } catch (e) {
    console.error("Invalid request body:", e);
    return { statusCode: 400, body: JSON.stringify({ status: 'error', message: 'Invalid JSON body' }) };
  }

  try {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();
    if (!doc.exists) {
      return { statusCode: 404, body: JSON.stringify({ status: 'error', message: 'Session not found' }) };
    }

    const sessionData = doc.data();

    // If a report already exists, return it
    if (sessionData.reportData) {
      return { statusCode: 200, body: JSON.stringify({ status: 'complete', data: sessionData.reportData }) };
    }

    console.log('Generating new report with Gemini');

    // Prepare AI call
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = createPrompt(sessionData.answers || {}, sessionData.faceAnalysis || null);

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
    });

    const response = await result.response;
    const rawText = response.text ? response.text() : "";
    if (!rawText || rawText.trim().length === 0) {
      throw new Error("Empty response from model");
    }

    // Remove code fences and try to extract JSON block
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/gi, '').trim();
    let reportData;
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) throw new Error("No JSON object detected in model output");
      reportData = JSON.parse(jsonMatch[0]);
      // Validate minimal fields presence
      if (!reportData.freeReport || !reportData.freeReport.metrics || typeof reportData.freeReport.metrics.wellnessScore === 'undefined') {
        throw new Error("Required keys missing from parsed JSON");
      }
    } catch (parseErr) {
      console.error("Parse error, falling back:", parseErr, "raw:", cleaned.substring(0, 200));
      // Use fallback that contains the full schema
      reportData = buildFallback(sessionData, sessionData.faceAnalysis || null);
    }

    // Save to Firestore
    try {
      await sessionRef.update({ reportData, reportStatus: 'complete' });
    } catch (saveErr) {
      console.error("Failed saving report to Firestore:", saveErr);
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'complete', data: reportData }) };

  } catch (error) {
    console.error('Error generating report:', error);
    // Final fallback: produce fallback report and return 200 so frontend can display something
    try {
      const minimalFallback = buildFallback({}, null);
      return { statusCode: 200, body: JSON.stringify({ status: 'complete', data: minimalFallback }) };
    } catch (finalErr) {
      console.error("Final fallback failed:", finalErr);
      return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Failed to generate report' }) };
    }
  }
};
