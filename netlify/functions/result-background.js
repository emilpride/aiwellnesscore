// /netlify/functions/result-background.js - ИСПРАВЛЕННАЯ ВЕРСИЯ С BACKGROUND

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

REQUIRED JSON SCHEMA (return only this object, exact keys and structure):
{
  "freeReport": {
    "metrics": {
      "wellnessScore": number (1-100),
      "biologicalAge": number,
      "energyIndex": number (1-100),
      "stressLevel": number (1-10)
    },
    "coreFour": {
      "mind": {"score": number (0-100), "summary": string},
      "body": {"score": number (0-100), "summary": string, "bmi": number | null},
      "nutrition": {"score": number (0-100), "summary": string, "fruitsVegPerDay": number | null, "processedFoodLevel": string | null, "waterLiters": number | null},
      "sleep": {"score": number (0-100), "summary": string, "hours": number | null, "visualSigns": string | null}
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
      "recoveryScore": number (1-100),
      "inflammationRiskIndex": number (1-100),
      "digitalWellnessScore": number (1-100)
    },
    "faceAnalysis": {
      "skinHealthScore": number (1-100),
      "hydrationAssessment": string,
      "sleepDebtVisualization": string,
      "stressMarkers": string
    },
    "recommendations": {
      "circadianReset": {
        "bedtime": string (format "HH:MM"),
        "wakeTime": string (format "HH:MM"),
        "steps": [string, string, string]
      },
      "nutritionGaps": [
        {"nutrient": string, "why": string},
        {"nutrient": string, "why": string}
      ],
      "exercisePrescription": {
        "type": string,
        "durationMin": number,
        "timeOfDay": string
      },
      "stressToolkit": [string, string, string]
    },
    "forecasts": {
      "thirtyDayPotential": {
        "expectedWellnessScoreIncrease": number,
        "notes": string
      },
      "riskTimeline": [
        {"yearsFromNow": number, "risk": string},
        {"yearsFromNow": number, "risk": string}
      ],
      "habitStackingPlan": [
        {"week": 1, "habit": string},
        {"week": 2, "habit": string},
        {"week": 3, "habit": string}
      ]
    },
    "aiCoachNotes": string
  }
}`;
}

function buildFallback(sessionData = {}, faceAnalysis = null) {
  const answers = sessionData.answers || {};
  let height = null, weight = null, age = 35;
  
  // Парсим базовые данные
  try {
    if (answers.age) {
      const ageStr = answers.age.toString();
      if (ageStr.includes('-')) {
        const range = ageStr.split('-');
        age = parseInt(range[0]) + 5;
      } else if (ageStr.includes('+')) {
        age = parseInt(ageStr) || 55;
      } else {
        age = parseInt(ageStr) || 35;
      }
    }
  } catch(e) {
    console.error("Error parsing age:", e);
  }

  const stressLevel = answers.stress ? 
    (answers.stress.includes('Very High') || answers.stress.includes('9-10') ? 9 : 
     answers.stress.includes('High') || answers.stress.includes('7-8') ? 7 : 
     answers.stress.includes('Moderate') || answers.stress.includes('4-6') ? 5 : 3) : 5;

  let wellnessScore = 65;
  if (answers.sleep && answers.sleep.includes('7-8')) wellnessScore += 5;
  if (answers.activity && (answers.activity.includes('3-4') || answers.activity.includes('5+'))) wellnessScore += 5;
  if (stressLevel <= 5) wellnessScore += 3;

  return {
    freeReport: {
      metrics: {
        wellnessScore: wellnessScore,
        biologicalAge: age + Math.round(Math.random() * 6 - 3),
        energyIndex: 70,
        stressLevel: stressLevel
      },
      coreFour: {
        mind: {
          score: 70,
          summary: "Moderate mental wellness"
        },
        body: {
          score: 65,
          summary: "Regular activity recommended",
          bmi: null
        },
        nutrition: {
          score: 60,
          summary: "Room for dietary improvements",
          fruitsVegPerDay: 3,
          processedFoodLevel: "Moderate",
          waterLiters: 1.5
        },
        sleep: {
          score: 75,
          summary: "Generally good sleep patterns",
          hours: 7,
          visualSigns: null
        }
      },
      insights: {
        mainBarrier: "Inconsistent daily routines",
        quickWin: "Start with 10-minute morning meditation",
        comparison: "You're in the 60th percentile for your age group"
      }
    },
    premiumReport: {
      detailedAnalytics: {
        metabolicAge: age + 2,
        recoveryScore: 70,
        inflammationRiskIndex: 40,
        digitalWellnessScore: 65
      },
      faceAnalysis: {
        skinHealthScore: 75,
        hydrationAssessment: "Moderate hydration levels",
        sleepDebtVisualization: "Mild signs of sleep deprivation",
        stressMarkers: "Some tension visible"
      },
      recommendations: {
        circadianReset: {
          bedtime: "22:30",
          wakeTime: "06:30",
          steps: [
            "Dim lights 2 hours before bed",
            "No screens 1 hour before sleep",
            "Morning sunlight exposure"
          ]
        },
        nutritionGaps: [
          { nutrient: "Vitamin D", why: "Low sun exposure" },
          { nutrient: "Omega-3", why: "Brain health support" }
        ],
        exercisePrescription: {
          type: "HIIT and Yoga combination",
          durationMin: 30,
          timeOfDay: "Morning"
        },
        stressToolkit: [
          "Box breathing technique",
          "Progressive muscle relaxation",
          "Gratitude journaling"
        ]
      },
      forecasts: {
        thirtyDayPotential: {
          expectedWellnessScoreIncrease: 8,
          notes: "Focus on sleep and stress management"
        },
        riskTimeline: [
          { yearsFromNow: 5, risk: "Increased stress-related issues if patterns continue" },
          { yearsFromNow: 10, risk: "Metabolic health concerns without lifestyle changes" }
        ],
        habitStackingPlan: [
          { week: 1, habit: "5-minute morning meditation" },
          { week: 2, habit: "Add 10-minute evening walk" },
          { week: 3, habit: "Digital sunset at 9 PM" }
        ]
      },
      aiCoachNotes: "You're on the right track! Small consistent changes will lead to big improvements."
    }
  };
}

// ГЛАВНОЕ ИЗМЕНЕНИЕ - делаем handler асинхронным и ждём начала генерации
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Session ID is required' }) };
    }
    
    console.log(`[${sessionId}] Starting report generation.`);
    const sessionRef = db.collection('sessions').doc(sessionId);
    
    // Проверяем существование сессии
    const doc = await sessionRef.get();
    if (!doc.exists) {
      console.error(`Session ${sessionId} not found`);
      return { 
        statusCode: 404, 
        body: JSON.stringify({ error: 'Session not found' }) 
      };
    }
    
    // Устанавливаем статус processing
    await sessionRef.update({ reportStatus: 'processing' });
    console.log(`[${sessionId}] Status set to processing`);
    
    // Запускаем генерацию в фоне
    setTimeout(async () => {
      try {
        const sessionData = doc.data();
        const faceAnalysisData = sessionData.faceAnalysis || null;
        
        // Пробуем сгенерировать через AI
        try {
          if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not configured');
          }
          
          const prompt = createPrompt(sessionData.answers, faceAnalysisData);
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
          
          console.log(`[${sessionId}] Calling Gemini API...`);
          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { 
              temperature: 0.7,
              maxOutputTokens: 8000,
              topP: 0.9,
              topK: 40
            }
          });
          
          const response = await result.response;
          const rawText = response.text ? response.text() : "";
          console.log(`[${sessionId}] Got response from Gemini, length: ${rawText.length}`);
          
          if (!rawText || rawText.trim().length === 0) {
            throw new Error("Empty response from model");
          }

          const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/gi, '').trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}$/);
          if (!jsonMatch) {
            throw new Error("No JSON in response");
          }
          
          const reportData = JSON.parse(jsonMatch[0]);
          
          if (!reportData.freeReport || !reportData.freeReport.metrics) {
            throw new Error("Invalid report structure");
          }
          
          await sessionRef.update({ 
            reportData, 
            reportStatus: 'complete' 
          });
          console.log(`[${sessionId}] Report saved successfully`);
          
        } catch (aiError) {
          console.error(`[${sessionId}] AI generation failed:`, aiError.message);
          // Используем fallback
          const fallbackReport = buildFallback(sessionData, faceAnalysisData);
          await sessionRef.update({ 
            reportData: fallbackReport, 
            reportStatus: 'complete',
            reportError: `Fallback used: ${aiError.message}`
          });
          console.log(`[${sessionId}] Fallback report saved`);
        }
        
      } catch (error) {
        console.error(`[${sessionId}] Fatal error:`, error);
        await sessionRef.update({ 
          reportStatus: 'error', 
          reportError: error.message 
        });
      }
    }, 100); // Небольшая задержка чтобы handler успел вернуть ответ
    
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Report generation started', sessionId })
    };
    
  } catch (error) {
    console.error('Handler error:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
