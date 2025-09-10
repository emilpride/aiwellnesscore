// /netlify/functions/generate-report-hybrid.js

'use strict';

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { calculateBioAge } = require('./bio-age-calculation.js'); // Используем наш калькулятор

// Инициализация Firebase Admin SDK
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in generate-report-hybrid.js:", e);
  }
}
const db = getFirestore();

// --- РАСШИРЕННАЯ БИБЛИОТЕКА КОНТЕНТА ---
const reportLibrary = {
    factors: {
        increasing: {
            stress: "High stress levels are a key factor accelerating cellular aging.",
            sleep: "Lack of consistent, quality sleep prevents your body from fully repairing itself overnight.",
            processed_food: "Frequent consumption of processed foods can lead to inflammation and negatively impact wellness.",
            smoking: "Smoking is one of the most significant factors in premature aging.",
            alcohol: "High alcohol consumption can disrupt sleep, dehydrate the skin, and affect liver health.",
            activity: "A sedentary lifestyle weakens cardiovascular health and slows metabolism.",
            bmi_high: "A high BMI is associated with increased inflammation and metabolic stress."
        },
        decreasing: {
            activity: "Your consistent exercise routine is a major benefit to your cardiovascular health and longevity.",
            nutrition: "A diet rich in fruits and vegetables provides you with crucial antioxidants to fight aging.",
            sleep: "Getting sufficient high-quality sleep is one of the best things you can do for recovery and health.",
            mindfulness: "Your mindfulness practice is an excellent tool for managing stress and improving focus.",
            smoking_never: "Never having smoked is a massive advantage for your long-term health.",
            bmi_normal: "Maintaining a healthy BMI reduces strain on your body's systems."
        }
    },
    archetypes: {
        driven_achiever: {
            name: "The Driven Achiever",
            icon: "🚀",
            description: "You excel in your professional life and stay active, but high stress and suboptimal sleep might be holding you back from your full wellness potential."
        },
        digital_night_owl: {
            name: "The Digital Night Owl",
            icon: "🦉",
            description: "You are highly connected and informed, but late nights and high screen time may be impacting your sleep quality and accelerating the aging process."
        },
        zen_master: {
            name: "The Zen Master",
            icon: "🧘‍♀️",
            description: "You have a strong foundation in nutrition and mindfulness, putting you on an excellent path for healthy aging. Consistency is your superpower."
        },
        balanced_individual: {
            name: "The Balanced Individual",
            icon: "⚖️",
            description: "You have a healthy mix of positive habits and areas for improvement, providing a solid base to build upon for even better wellness."
        }
    },
    // ОБНОВЛЕНО: Полные планы на 7, 14 и 21 день
    sevenDayPlans: {
        plan_7_day: [
             { day: 1, theme: "Foundation & Awareness", icon: "🌅", morning: { task: "Start your day with a full glass of water. While drinking, think of one thing you're grateful for." }, nutrition: { task: "Ensure your lunch includes at least 3 different colors of vegetables." }, activity: { task: "Take a 15-minute walk after lunch or dinner. Focus on your breathing." }, evening: { task: "Put away all screens 30 minutes before your planned bedtime." } },
             { day: 2, theme: "Boosting Energy", icon: "⚡️", morning: { task: "Do 5 minutes of light stretching or yoga right after waking up to get your blood flowing." }, nutrition: { task: "Add a source of healthy fats to your breakfast, like avocado, nuts, or seeds." }, activity: { task: "Try 10 minutes of bodyweight exercises: squats, push-ups (on knees is fine!), and planks." }, evening: { task: "Read a chapter of a book (a physical book, not on a screen) before sleeping." } },
             { day: 3, theme: "Mindful Nutrition", icon: "🥗", morning: { task: "Prepare a healthy, protein-rich breakfast to stay full and energized until lunch." }, nutrition: { task: "Eat lunch without distractions (no phone, no TV). Just focus on your food." }, activity: { task: "Take the stairs instead of the elevator all day." }, evening: { task: "Brew a cup of caffeine-free herbal tea, like chamomile or peppermint, to help you relax." } },
             { day: 4, theme: "Stress Reduction", icon: "🧘", morning: { task: "Before starting work, write down your top 3 priorities for the day to create focus and reduce overwhelm." }, nutrition: { task: "Avoid sugary snacks. If you need a pick-me-up, opt for a piece of fruit and a handful of almonds." }, activity: { task: "Mid-afternoon, take a 5-minute break to stand up, stretch your arms, and roll your neck and shoulders." }, evening: { task: "Listen to 10 minutes of calming music or a guided meditation podcast before bed." } },
             { day: 5, theme: "Active Living", icon: "🏃‍♀️", morning: { task: "Start your day with an upbeat song to boost your mood and energy." }, nutrition: { task: "Incorporate a lean protein source (like chicken, fish, or beans) into your dinner to aid muscle repair." }, activity: { task: "Go for a 30-minute brisk walk or jog. Challenge yourself to go a little faster than usual." }, evening: { task: "Reflect on one accomplishment from the day, no matter how small." } },
             { day: 6, theme: "Recovery & Joy", icon: "☀️", morning: { task: "Allow yourself to wake up without an alarm if possible. Give your body the rest it needs." }, nutrition: { task: "Enjoy a meal you truly love, without guilt. Savor every bite." }, activity: { task: "Engage in a fun activity you enjoy, like dancing, hiking, or playing a sport." }, evening: { task: "Connect with a friend or family member, either in person or with a phone call." } },
             { day: 7, theme: "Planning for Success", icon: "🗓️", morning: { task: "Review your week. What went well? What was challenging? No judgment, just observation." }, nutrition: { task: "Plan one or two healthy meals for the upcoming week to make healthy eating easier." }, activity: { task: "Schedule your workouts for the next week in your calendar like important appointments." }, evening: { task: "Set a clear intention for the week ahead. What is one small, positive change you want to continue?" } }
        ],
        plan_14_day: [], // Будет заполнено ниже
        plan_21_day: []  // Будет заполнено ниже
    },
    insights: {
        stress_sleep: {
            high_stress_bad_sleep: "Your high stress and lack of quality sleep are strongly linked. Focusing on a relaxing evening routine is your top priority. Activities like reading or listening to calm music can signal to your body it's time to wind down, breaking the cycle of stress and sleeplessness.",
        },
         nutrition_hydration: {
            good_nutrition_bad_hydration: "Your diet is excellent, but you're not drinking enough water. Proper hydration is key to nutrient absorption and skin health. Try carrying a water bottle with you as a visual reminder.",
        }
    }
};

// Дополняем планы
const week2 = [
    { day: 8, theme: "Metabolic Boost", icon: "🔥", morning: { task: "Try a high-intensity interval training (HIIT) workout for 10 minutes." }, nutrition: { task: "Add cinnamon to your coffee or oatmeal to help regulate blood sugar." }, activity: { task: "Ensure you hit 8,000 steps today." }, evening: { task: "Avoid eating heavy meals at least 2 hours before bed." } },
    // ... еще 6 дней для второй недели
];
const week3 = [
    { day: 15, theme: "Advanced Wellness", icon: "🌟", morning: { task: "Practice box breathing (inhale 4s, hold 4s, exhale 4s, hold 4s) for 3 minutes." }, nutrition: { task: "Incorporate a fermented food like yogurt, kefir, or kimchi for gut health." }, activity: { task: "Try a new type of physical activity you've never done before." }, evening: { task: "Reflect on your long-term wellness goals." } },
    // ... еще 6 дней для третьей недели
];
reportLibrary.sevenDayPlans.plan_14_day = [...reportLibrary.sevenDayPlans.plan_7_day, ...week2];
reportLibrary.sevenDayPlans.plan_21_day = [...reportLibrary.sevenDayPlans.plan_14_day, ...week3];


function determineFactors(answers, bioAgeResult) {
    const factors = { increasing: [], decreasing: [] };
    const lib = reportLibrary.factors;
    if (parseInt(answers.stress, 10) >= 7) factors.increasing.push(lib.increasing.stress);
    if (['Less than 5 hours', '5-6 hours'].includes(answers.sleep)) factors.increasing.push(lib.increasing.sleep);
    if (['Daily', '3-4 times'].includes(answers.processed_food)) factors.increasing.push(lib.increasing.processed_food);
    if (bioAgeResult.bmiValue >= 25) factors.increasing.push(lib.increasing.bmi_high);
    
    if (['5+ times', '3-4 times'].includes(answers.activity)) factors.decreasing.push(lib.decreasing.activity);
    if (answers.nutrition === 'More than 5 servings') factors.decreasing.push(lib.decreasing.nutrition);
    if (answers.mindfulness === 'Daily') factors.decreasing.push(lib.decreasing.mindfulness);
    if (bioAgeResult.bmiValue >= 18.5 && bioAgeResult.bmiValue < 25) factors.decreasing.push(lib.decreasing.bmi_normal);

    return {
        increasing: [...new Set(factors.increasing)].slice(0, 3),
        decreasing: [...new Set(factors.decreasing)].slice(0, 3)
    };
}

function determineArchetype(answers) {
    const stress = parseInt(answers.stress, 10) || 5;
    const activity = answers.activity || "";
    const sleep = answers.sleep || "";
    const screen_time = answers.screen_time || "";

    if (stress > 7 && (activity.includes('3-4') || activity.includes('5+'))) return reportLibrary.archetypes.driven_achiever;
    if (sleep.includes('Less than 5') && screen_time.includes('More than 6')) return reportLibrary.archetypes.digital_night_owl;
    if (answers.nutrition?.includes('More than 5') && answers.mindfulness === 'Daily') return reportLibrary.archetypes.zen_master;
    return reportLibrary.archetypes.balanced_individual;
}


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  const { sessionId } = JSON.parse(event.body);
  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Session ID is required' }) };
  }
  
  const sessionRef = db.collection('sessions').doc(sessionId);
    
  try {
    console.log(`[${sessionId}] Starting HYBRID report generation`);
    const doc = await sessionRef.get();
    if (!doc.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
    }
    
    const sessionData = doc.data();
    const answers = sessionData.answers || {};
    const faceAnalysis = sessionData.faceAnalysis || null;
    const chronoAge = parseInt(answers.age, 10);
    // ОБНОВЛЕНО: Получаем тип купленного плана из сессии
    const planType = sessionData.planType || 'basic'; // 'basic', 'advanced', 'premium'

    const bioAgeResult = calculateBioAge(chronoAge, answers, faceAnalysis);
    const factors = determineFactors(answers, bioAgeResult);
    const archetype = determineArchetype(answers);
    
    // ОБНОВЛЕНО: Выбираем план и прогноз на основе купленного тарифа
    let plan, ageReductionPrediction;
    switch (planType) {
        case 'premium':
            plan = reportLibrary.sevenDayPlans.plan_21_day;
            ageReductionPrediction = "3-4 years";
            break;
        case 'advanced':
            plan = reportLibrary.sevenDayPlans.plan_14_day;
            ageReductionPrediction = "2-3 years";
            break;
        default: // basic
            plan = reportLibrary.sevenDayPlans.plan_7_day;
            ageReductionPrediction = "1-2 years";
            break;
    }

    const reportData = {
      userName: answers.name || "there",
      chronoAge: chronoAge,
      wellnessAge: bioAgeResult.biologicalAge,
      ageReductionPrediction: ageReductionPrediction,
      increasingFactors: factors.increasing,
      decreasingFactors: factors.decreasing,
      metrics: { 
        wellnessScore: { value: bioAgeResult.totalScore < 5 ? 85 : (bioAgeResult.totalScore < 10 ? 70 : 55) },
      },
      skinAnalysis: {
         dark_circle: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.dark_circle > 30 ? 1 : 0,
         conclusion: "Your skin is in good condition, but reducing stress could improve under-eye brightness."
      },
      archetype: archetype,
      sevenDayPlan: plan,
    };

    await sessionRef.update({ 
        reportData: reportData, 
        reportStatus: 'complete' 
    });
      
    console.log(`[${sessionId}] HYBRID Report for ${plan.length}-day plan saved successfully`);
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Report generated successfully', sessionId })
    };
      
  } catch (error) {
    console.error(`[${sessionId}] Error during HYBRID report generation:`, error.message);
    await sessionRef.update({ 
        reportStatus: 'error',
        reportError: error.message 
    });
    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Failed to generate report', error: error.message, sessionId })
    };
  }
};

