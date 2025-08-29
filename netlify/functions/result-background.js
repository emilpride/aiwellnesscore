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
    console.error("Firebase init error:", e);
  }
}

const db = getFirestore();

function createFullPrompt(answers = {}, faceAnalysis) {
  const quizData = Object.entries(answers)
    .filter(([k]) => !['selfie','faceAnalysis','skinAnalysis','reportData','reportStatus','reportError'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || "No quiz answers provided.";

  const faceData = faceAnalysis ? `
Face Analysis Data:
- Age appearance: ${faceAnalysis.faces?.[0]?.attributes?.age?.value || 'N/A'}
- Skin health: ${faceAnalysis.faces?.[0]?.attributes?.skinstatus?.health || 'N/A'}
- Dark circles: ${faceAnalysis.faces?.[0]?.attributes?.skinstatus?.dark_circle || 'N/A'}
- Acne: ${faceAnalysis.faces?.[0]?.attributes?.skinstatus?.acne || 'N/A'}
` : "No face analysis available";

  return `You are an AI wellness analyst. Create a personalized wellness report based on this data.

USER DATA:
${quizData}

${faceData}

Generate a complete, personalized JSON report. Use the actual user data to calculate scores. Be specific, not generic.

REQUIRED JSON STRUCTURE (return ONLY valid JSON, no other text):
{
  "freeReport": {
    "metrics": {
      "wellnessScore": [Calculate 1-100 based on all factors],
      "biologicalAge": [Calculate based on lifestyle + face age if available],
      "energyIndex": [1-100 based on sleep, activity, nutrition],
      "stressLevel": [1-10 based on reported stress + visual signs]
    },
    "coreFour": {
      "mind": {
        "score": [0-100],
        "summary": "[Specific insight based on their stress and mindfulness data]"
      },
      "body": {
        "score": [0-100],
        "summary": "[Specific insight based on activity and physical data]",
        "bmi": [Calculate if height/weight provided, else null]
      },
      "nutrition": {
        "score": [0-100],
        "summary": "[Specific insight based on their diet answers]",
        "fruitsVegPerDay": [From their answer],
        "processedFoodLevel": "[From their answer]",
        "waterLiters": [Calculate from glasses]
      },
      "sleep": {
        "score": [0-100],
        "summary": "[Combine sleep hours with visual fatigue signs]",
        "hours": [From their answer],
        "visualSigns": "[Dark circles/eye bags if face analysis available]"
      }
    },
    "insights": {
      "mainBarrier": "[The ONE biggest issue from their data]",
      "quickWin": "[One specific easy change for maximum impact]",
      "comparison": "[Compare to others their age: top X%]"
    }
  },
  "premiumReport": {
    "detailedAnalytics": {
      "metabolicAge": [Calculate based on BMI, activity, nutrition],
      "recoveryScore": [1-100 based on sleep, age, stress],
      "inflammationRiskIndex": [1-100 based on diet, stress, sleep],
      "digitalWellnessScore": [1-100 based on screen time]
    },
    "faceAnalysis": {
      "skinHealthScore": [From face data or estimate],
      "hydrationAssessment": "[Based on skin + water intake]",
      "sleepDebtVisualization": "[Based on dark circles + sleep hours]",
      "stressMarkers": "[Based on skin analysis + reported stress]"
    },
    "recommendations": {
      "circadianReset": {
        "bedtime": "[Calculate optimal based on their schedule]",
        "wakeTime": "[Based on sleep needs]",
        "steps": ["Step 1", "Step 2", "Step 3"]
      },
      "nutritionGaps": [
        {"nutrient": "[Specific nutrient]", "why": "[Why they need it]"},
        {"nutrient": "[Another nutrient]", "why": "[Reason]"}
      ],
      "exercisePrescription": {
        "type": "[Best type for their level]",
        "durationMin": [Realistic number],
        "timeOfDay": "[Based on their energy]"
      },
      "stressToolkit": [
        "[Technique 1 for their stress level]",
        "[Technique 2]",
        "[Technique 3]"
      ]
    },
    "forecasts": {
      "thirtyDayPotential": {
        "expectedWellnessScoreIncrease": [Realistic number],
        "notes": "[What to focus on]"
      },
      "riskTimeline": [
        {"yearsFromNow": 5, "risk": "[Specific risk if habits continue]"},
        {"yearsFromNow": 10, "risk": "[Long-term risk]"}
      ],
      "habitStackingPlan": [
        {"week": 1, "habit": "[First habit]"},
        {"week": 2, "habit": "[Second habit]"},
        {"week": 3, "habit": "[Third habit]"}
      ]
    },
    "aiCoachNotes": "[Personalized motivational message based on their specific situation]"
  }
}`;
}

function buildCompleteFallback(sessionData = {}, faceAnalysis = null) {
  const answers = sessionData.answers || {};
  
  // Извлекаем все данные из ответов
  let age = 35, stressLevel = 5, sleepHours = 7;
  let activity = "moderate", nutrition = "average", mindfulness = "occasional";
  
  // Парсим возраст
  if (answers.age) {
    const ageStr = answers.age.toString();
    if (ageStr.includes('Under')) age = 16;
    else if (ageStr.includes('18-25')) age = 22;
    else if (ageStr.includes('26-35')) age = 30;
    else if (ageStr.includes('36-50')) age = 43;
    else if (ageStr.includes('50+')) age = 55;
    else age = parseInt(ageStr) || 35;
  }
  
  // Парсим стресс
  if (answers.stress) {
    if (answers.stress.includes('Low') || answers.stress.includes('1-3')) stressLevel = 3;
    else if (answers.stress.includes('Moderate') || answers.stress.includes('4-6')) stressLevel = 5;
    else if (answers.stress.includes('High') || answers.stress.includes('7-8')) stressLevel = 7;
    else if (answers.stress.includes('Very High') || answers.stress.includes('9-10')) stressLevel = 9;
  }
  
  // Парсим сон
  if (answers.sleep) {
    if (answers.sleep.includes('Less than 5')) sleepHours = 4;
    else if (answers.sleep.includes('5-6')) sleepHours = 5.5;
    else if (answers.sleep.includes('7-8')) sleepHours = 7.5;
    else if (answers.sleep.includes('More than 8')) sleepHours = 9;
    else sleepHours = parseFloat(answers.sleep) || 7;
  }
  
  // Рассчитываем wellness score на основе реальных данных
  let wellnessScore = 50;
  if (sleepHours >= 7 && sleepHours <= 9) wellnessScore += 10;
  if (stressLevel <= 5) wellnessScore += 10;
  if (answers.activity && (answers.activity.includes('3-4') || answers.activity.includes('5+'))) wellnessScore += 10;
  if (answers.nutrition && (answers.nutrition.includes('4-5') || answers.nutrition.includes('More'))) wellnessScore += 10;
  if (answers.mindfulness && answers.mindfulness.includes('Daily')) wellnessScore += 10;
  
  // Биологический возраст
  let biologicalAge = age;
  if (wellnessScore < 50) biologicalAge += 5;
  else if (wellnessScore > 70) biologicalAge -= 3;
  
  // Face анализ
  const faceAge = faceAnalysis?.faces?.[0]?.attributes?.age?.value;
  if (faceAge) {
    biologicalAge = Math.round((biologicalAge + faceAge) / 2);
  }

  return {
    freeReport: {
      metrics: {
        wellnessScore: Math.min(100, Math.max(1, wellnessScore)),
        biologicalAge: biologicalAge,
        energyIndex: Math.round(50 + (sleepHours * 5) - (stressLevel * 3)),
        stressLevel: stressLevel
      },
      coreFour: {
        mind: {
          score: Math.round(100 - (stressLevel * 10)),
          summary: stressLevel > 6 ? "High stress is impacting your mental wellness" : "Your mental wellness is stable"
        },
        body: {
          score: answers.activity?.includes('5+') ? 85 : answers.activity?.includes('3-4') ? 70 : 50,
          summary: answers.activity?.includes('Rarely') ? "Movement is essential for your health" : "Good activity level",
          bmi: null
        },
        nutrition: {
          score: answers.nutrition?.includes('More') ? 85 : answers.nutrition?.includes('4-5') ? 70 : 50,
          summary: answers.processed_food?.includes('Daily') ? "Reduce processed foods for better health" : "Your nutrition needs some improvements",
          fruitsVegPerDay: parseInt(answers.nutrition) || 3,
          processedFoodLevel: answers.processed_food || "Moderate",
          waterLiters: answers.hydration ? parseFloat(answers.hydration) * 0.24 : 1.5
        },
        sleep: {
          score: sleepHours >= 7 && sleepHours <= 9 ? 80 : 60,
          summary: `${sleepHours} hours of sleep ${sleepHours < 7 ? 'is insufficient' : 'is good'}`,
          hours: sleepHours,
          visualSigns: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.dark_circle > 30 ? "Dark circles detected" : null
        }
      },
      insights: {
        mainBarrier: stressLevel > 6 ? "Chronic stress is your main wellness barrier" : 
                     sleepHours < 7 ? "Insufficient sleep is holding you back" : 
                     "Inconsistent healthy habits",
        quickWin: sleepHours < 7 ? "Add 30 minutes more sleep tonight" : 
                  stressLevel > 6 ? "Try 5 minutes of deep breathing now" : 
                  "Start with a 10-minute morning walk",
        comparison: `You're in the ${wellnessScore > 70 ? 'top 30%' : wellnessScore > 50 ? 'middle 50%' : 'lower 30%'} for your age group`
      }
    },
    premiumReport: {
      detailedAnalytics: {
        metabolicAge: biologicalAge + (answers.activity?.includes('Rarely') ? 3 : -1),
        recoveryScore: Math.round(70 - (age/10) + (sleepHours - 6) * 10),
        inflammationRiskIndex: answers.processed_food?.includes('Daily') ? 70 : 40,
        digitalWellnessScore: answers.screen_time?.includes('More than 6') ? 30 : 60
      },
      faceAnalysis: {
        skinHealthScore: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.health || 70,
        hydrationAssessment: answers.hydration?.includes('7+') ? "Well hydrated" : "Needs more water",
        sleepDebtVisualization: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.dark_circle > 30 ? 
                                "Significant sleep debt visible" : "Minor fatigue signs",
        stressMarkers: stressLevel > 6 ? "Stress signs visible in facial tension" : "Minimal stress markers"
      },
      recommendations: {
        circadianReset: {
          bedtime: sleepHours < 7 ? "22:00" : "22:30",
          wakeTime: sleepHours < 7 ? "06:00" : "06:30",
          steps: [
            "Dim all lights 2 hours before bedtime",
            "No screens 1 hour before sleep",
            "Get sunlight within 30 minutes of waking"
          ]
        },
        nutritionGaps: [
          { nutrient: "Vitamin D", why: answers.activity?.includes('Rarely') ? "Low outdoor activity" : "General health support" },
          { nutrient: "Magnesium", why: stressLevel > 6 ? "Helps with stress and sleep" : "Supports recovery" }
        ],
        exercisePrescription: {
          type: answers.activity?.includes('Rarely') ? "Walking" : "HIIT and Yoga",
          durationMin: answers.activity?.includes('Rarely') ? 20 : 30,
          timeOfDay: sleepHours < 7 ? "Evening" : "Morning"
        },
        stressToolkit: [
          stressLevel > 6 ? "4-7-8 breathing technique" : "Daily gratitude practice",
          "Progressive muscle relaxation before bed",
          "5-minute meditation using an app"
        ]
      },
      forecasts: {
        thirtyDayPotential: {
          expectedWellnessScoreIncrease: wellnessScore < 50 ? 12 : 8,
          notes: stressLevel > 6 ? "Focus on stress reduction first" : "Consistency is key"
        },
        riskTimeline: [
          { 
            yearsFromNow: 5, 
            risk: stressLevel > 6 ? "Burnout and chronic fatigue likely" : "Minor health decline possible"
          },
          { 
            yearsFromNow: 10, 
            risk: answers.activity?.includes('Rarely') ? "Cardiovascular risks increase significantly" : "Age-related decline accelerates"
          }
        ],
        habitStackingPlan: [
          { week: 1, habit: sleepHours < 7 ? "Go to bed 15 minutes earlier" : "5-minute morning stretch" },
          { week: 2, habit: stressLevel > 6 ? "One breathing exercise daily" : "Add one fruit to breakfast" },
          { week: 3, habit: "10-minute walk after lunch" }
        ]
      },
      aiCoachNotes: `Based on your assessment, ${stressLevel > 6 ? "I can see you're dealing with significant stress" : "you're doing several things right"}. Your wellness score of ${wellnessScore} shows ${wellnessScore > 70 ? "you're ahead of the curve" : "there's room for improvement"}. The most impactful change you can make right now is ${sleepHours < 7 ? "improving your sleep" : stressLevel > 6 ? "managing your stress" : "building consistency"}. Remember, small changes compound over time!`
    }
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
      
      // Таймаут 8 секунд для API
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
      
      // Проверяем структуру
      if (!reportData.freeReport?.metrics) throw new Error('Invalid report structure');
      
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
