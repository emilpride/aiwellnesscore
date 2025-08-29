// /netlify/functions/result-background.js - ПОЛНАЯ ВЕРСИЯ

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
    if (answers.height) {
      const heightStr = answers.height.toString();
      if (heightStr.includes('cm')) {
        height = parseFloat(heightStr);
      } else if (heightStr.includes('ft') || heightStr.includes("'")) {
        const matches = heightStr.match(/(\d+)'?\s*(\d+)?/);
        if (matches) {
          const feet = parseInt(matches[1]) || 0;
          const inches = parseInt(matches[2]) || 0;
          height = (feet * 30.48) + (inches * 2.54);
        }
      } else {
        height = parseFloat(heightStr) > 100 ? parseFloat(heightStr) : parseFloat(heightStr) * 100;
      }
    }
    if (answers.weight) {
      const weightStr = answers.weight.toString();
      weight = parseFloat(weightStr) * (weightStr.includes('kg') ? 1 : 0.453592);
    }
    if (answers.age) {
      age = parseInt(answers.age);
    }
  } catch(e) {
    console.error("Error parsing user data:", e);
  }

  const bmi = (height && weight && height > 0) ? +(weight / ((height/100)*(height/100))).toFixed(1) : null;
  const face = faceAnalysis || {};
  const estimatedVisualAge = face.age || null;
  const biologicalAgeEst = estimatedVisualAge ? Math.round((estimatedVisualAge + (age || estimatedVisualAge))/2) : (age || 35);
  
  let wellnessScore = 60;
  if (bmi && bmi >= 18.5 && bmi <= 24.9) wellnessScore += 5;
  if (answers.sleep && answers.sleep.includes('7-8')) wellnessScore += 5;
  if (answers.activity && answers.activity.includes('3-4')) wellnessScore += 3;
  if (answers.nutrition && answers.nutrition.includes('4-5')) wellnessScore += 3;
  if (answers.stress && answers.stress.includes('Low')) wellnessScore += 4;
  
  const stressLevel = answers.stress ? (answers.stress.includes('High') ? 8 : answers.stress.includes('Moderate') ? 5 : 3) : 5;

  return {
    freeReport: {
      metrics: {
        wellnessScore: Math.min(100, wellnessScore),
        biologicalAge: biologicalAgeEst,
        energyIndex: Math.round(70 + Math.random() * 20),
        stressLevel: stressLevel
      },
      coreFour: {
        mind: {
          score: Math.round(60 + Math.random() * 20),
          summary: stressLevel > 6 ? "High stress detected, focus on mindfulness" : "Moderate mental wellness"
        },
        body: {
          score: Math.round(55 + Math.random() * 25),
          summary: bmi ? `BMI: ${bmi} - ${bmi < 18.5 ? 'Underweight' : bmi <= 24.9 ? 'Healthy' : bmi <= 29.9 ? 'Overweight' : 'Obese'}` : "Physical activity recommended",
          bmi: bmi
        },
        nutrition: {
          score: Math.round(50 + Math.random() * 30),
          summary: "Room for dietary improvements",
          fruitsVegPerDay: answers.nutrition ? parseInt(answers.nutrition) || 3 : 3,
          processedFoodLevel: answers.processed_food || "Moderate",
          waterLiters: answers.hydration ? parseFloat(answers.hydration) * 0.24 : 1.5
        },
        sleep: {
          score: Math.round(60 + Math.random() * 20),
          summary: answers.sleep ? `Getting ${answers.sleep}` : "Sleep quality could improve",
          hours: answers.sleep ? parseFloat(answers.sleep) || 7 : 7,
          visualSigns: face.dark_circles ? "Dark circles detected" : null
        }
      },
      insights: {
        mainBarrier: stressLevel > 6 ? "Chronic stress affecting overall wellness" : "Inconsistent sleep patterns",
        quickWin: "Start with 10-minute morning meditation",
        comparison: "You're in the 60th percentile for your age group"
      }
    },
    premiumReport: {
      detailedAnalytics: {
        metabolicAge: biologicalAgeEst + Math.round(Math.random() * 6 - 3),
        recoveryScore: Math.round(65 + Math.random() * 20),
        inflammationRiskIndex: Math.round(30 + Math.random() * 40),
        digitalWellnessScore: Math.round(50 + Math.random() * 30)
      },
      faceAnalysis: {
        skinHealthScore: face.skin_health_score || Math.round(70 + Math.random() * 20),
        hydrationAssessment: "Moderate hydration levels",
        sleepDebtVisualization: "Mild signs of sleep deprivation",
        stressMarkers: "Some tension visible around eyes"
      },
      recommendations: {
        circadianReset: {
          bedtime: "22:30",
          wakeTime: "06:30",
          steps: ["Dim lights 2 hours before bed", "No screens 1 hour before sleep", "Morning sunlight exposure"]
        },
        nutritionGaps: [
          { nutrient: "Vitamin D", why: "Low sun exposure detected" },
          { nutrient: "Omega-3", why: "Support cognitive function" }
        ],
        exercisePrescription: {
          type: "HIIT and Yoga combination",
          durationMin: 30,
          timeOfDay: "Morning"
        },
        stressToolkit: ["Box breathing technique", "Progressive muscle relaxation", "Gratitude journaling"]
      },
      forecasts: {
        thirtyDayPotential: {
          expectedWellnessScoreIncrease: 8,
          notes: "Focus on sleep and stress management for best results"
        },
        riskTimeline: [
          { yearsFromNow: 5, risk: "Increased stress-related health issues if patterns continue" },
          { yearsFromNow: 10, risk: "Metabolic syndrome risk without lifestyle changes" }
        ],
        habitStackingPlan: [
          { week: 1, habit: "5-minute morning meditation" },
          { week: 2, habit: "Add 10-minute evening walk" },
          { week: 3, habit: "Implement digital sunset at 9 PM" },
          { week: 4, habit: "Weekly meal prep on Sundays" }
        ]
      },
      aiCoachNotes: "You're showing great potential! Your awareness is the first step. Focus on the quick wins I've identified, and remember: small consistent changes lead to remarkable transformations. I believe in your journey!"
    }
  };
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
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
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
      console.error(`[${sessionId}] JSON Parse error, using fallback:`, parseErr);
      reportData = buildFallback(sessionData, faceAnalysisData);
    }

    await sessionRef.update({ reportData, reportStatus: 'complete' });
    console.log(`[${sessionId}] Report successfully generated and saved to Firestore.`);
  } catch (error) {
    console.error(`--- FATAL ERROR in background generation for [${sessionId}] ---`, error);
    try {
      // В случае ошибки используем fallback
      const doc = await sessionRef.get();
      const sessionData = doc.exists ? doc.data() : {};
      const fallbackReport = buildFallback(sessionData, sessionData.faceAnalysis);
      await sessionRef.update({ 
        reportData: fallbackReport, 
        reportStatus: 'complete',
        reportError: `Used fallback due to: ${error.message}`
      });
      console.log(`[${sessionId}] Fallback report saved.`);
    } catch (dbError) {
      console.error(`--- [${sessionId}] Could not even save fallback ---`, dbError);
      await sessionRef.update({ 
        reportStatus: 'error', 
        reportError: error.message 
      });
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
