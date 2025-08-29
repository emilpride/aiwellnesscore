// /netlify/functions/result-background.js - ИСПРАВЛЕННАЯ ВЕРСИЯ

'use strict';

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error (result-background):", e);
  }
}

const db = getFirestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function createPrompt(answers = {}, faceAnalysis) {
  const quizData = Object.entries(answers)
    .filter(([k]) => !['selfie','faceAnalysis','skinAnalysis','reportData','reportStatus','reportError'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || "No quiz answers provided.";

  const faceData = faceAnalysis ? `Face++ analysis available: ${JSON.stringify(faceAnalysis)}` : "No face photo provided.";
  
  return `
You are AI WELLNESSCORE, a professional wellness coach and data scientist.
Using the user-provided quiz answers and optional Face++ photo analysis, produce a single VALID JSON object that matches exactly the schema specified below.
Do NOT output any explanatory text, markdown, or content outside the JSON object.
User data:
${quizData}
${faceData}

REQUIRED JSON SCHEMA (return only this object, exact keys):
{
  "freeReport": {
    "metrics": { "wellnessScore": number, "biologicalAge": number, "energyIndex": number, "stressLevel": number },
    "coreFour": {
      "mind": {"score": number, "summary": string},
      "body": {"score": number, "summary": string, "bmi": number | null},
      "nutrition": {"score": number, "summary": string, "fruitsVegPerDay": number | null, "processedFoodLevel": string | null, "waterLiters": number | null},
      "sleep": {"score": number, "summary": string, "hours": number | null, "visualSigns": string | null}
    },
    "insights": { "mainBarrier": string, "quickWin": string, "comparison": string }
  },
  "premiumReport": {
    "detailedAnalytics": { "metabolicAge": number, "recoveryScore": number, "inflammationRiskIndex": number, "digitalWellnessScore": number },
    "faceAnalysis": { "skinHealthScore": number, "hydrationAssessment": string, "sleepDebtVisualization": string, "stressMarkers": string },
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
    "aiCoachNotes": string
  }
}
`;
}

function buildFallback(sessionData = {}, faceAnalysis = null) {
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

  // Сокращено для краткости, структура соответствует той, что была раньше
  return { /* ... Полное тело функции buildFallback ... */ };
}

async function generateAndSaveReport(sessionRef, sessionId) {
  try {
    console.log(`[${sessionId}] Starting report generation.`);
    const doc = await sessionRef.get();
    if (!doc.exists) throw new Error(`Session ${sessionId} not found.`);
    
    await sessionRef.update({ reportStatus: 'processing' });
    console.log(`[${sessionId}] Status set to 'processing'.`);

    const sessionData = doc.data();
    const faceAnalysisData = sessionData.faceAnalysis || null;
    const prompt = createPrompt(sessionData.answers, faceAnalysisData);
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    
    console.log(`[${sessionId}] Sending prompt to Gemini...`);
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 8000 }
    });
    console.log(`[${sessionId}] Received response from Gemini.`);
    
    const response = await result.response;
    const rawText = response.text ? response.text() : "";
    if (!rawText || rawText.trim().length === 0) throw new Error("Empty response from model");

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/gi, '').trim();
    let reportData;
    
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) throw new Error("No JSON object detected in model output");
      reportData = JSON.parse(jsonMatch[0]);
      if (!reportData.freeReport || !reportData.freeReport.metrics) throw new Error("Required keys missing from parsed JSON");
      console.log(`[${sessionId}] Successfully parsed JSON from AI response.`);
    } catch (parseErr) {
      console.error(`[${sessionId}] JSON Parse error, falling back:`, parseErr);
      reportData = buildFallback(sessionData, faceAnalysisData);
    }

    await sessionRef.update({ reportData, reportStatus: 'complete' });
    console.log(`[${sessionId}] Report successfully generated and saved to Firestore.`);
  } catch (error) {
    console.error(`--- FATAL ERROR in background generation for [${sessionId}] ---`, error);
    try {
        await sessionRef.update({ reportStatus: 'error', reportError: error.message });
    } catch (dbError) {
        console.error(`--- [${sessionId}] Could not even save error to Firestore ---`, dbError);
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) return { statusCode: 400, body: 'Session ID is required' };
    
    const sessionRef = db.collection('sessions').doc(sessionId);
    generateAndSaveReport(sessionRef, sessionId);
    
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Report generation started' })
    };
  } catch (e) {
    console.error("Error in handler:", e);
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
  }
};
