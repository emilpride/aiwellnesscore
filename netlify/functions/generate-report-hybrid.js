// /netlify/functions/generate-report-hybrid.js

'use strict';

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { calculateBioAge } = require('./bio-age-calculation.js');

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
        driven_achiever: { name: "The Driven Achiever", icon: "🚀", description: "You excel in your professional life and stay active, but high stress and suboptimal sleep might be holding you back from your full wellness potential." },
        digital_night_owl: { name: "The Digital Night Owl", icon: "🦉", description: "You are highly connected and informed, but late nights and high screen time may be impacting your sleep quality and accelerating the aging process." },
        zen_master: { name: "The Zen Master", icon: "🧘‍♀️", description: "You have a strong foundation in nutrition and mindfulness, putting you on an excellent path for healthy aging. Consistency is your superpower." },
        balanced_individual: { name: "The Balanced Individual", icon: "⚖️", description: "You have a healthy mix of positive habits and areas for improvement, providing a solid base to build upon for even better wellness." }
    },
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
        plan_14_day: [],
        plan_21_day: []
    },
    // УЛУЧШЕНО: Библиотека инсайтов стала более подробной
    insights: {
        stress_sleep: {
            // ... (предыдущие инсайты)
            good_stress_good_sleep: "Your ability to manage stress and get quality sleep is a powerful combination for healthy aging. These two factors work together to ensure your body and mind recover effectively each day. Keep prioritizing these habits!",
            high_stress_good_sleep: "You're getting good sleep, which is excellent. However, your high stress levels mean your body is working overtime during the day. Focusing on stress-reduction techniques like meditation or short walks can make your great sleep even more restorative.",
            low_stress_bad_sleep: "You manage stress well, but your sleep is not optimal. This is your biggest opportunity for improvement. A consistent sleep schedule and a relaxing bedtime routine will supercharge your body's natural rejuvenation process."
        },
         nutrition_hydration: {
            // ... (предыдущие инсайты)
             great_nutrition_great_hydration: "Your nutrition and hydration habits are superb. You're providing your body with the essential nutrients and water it needs to thrive at a cellular level. This is a cornerstone of your wellness.",
             poor_nutrition_poor_hydration: "Improving your diet and water intake is a critical step. Start small: add one extra vegetable to your dinner and drink one extra glass of water each day. These small changes will have a big impact over time."
        },
        activity: {
            high_activity_poor_sleep: "Your high activity level is fantastic for your cardiovascular health, but without adequate sleep, your body can't fully recover. Prioritizing sleep will unlock the full benefits of your workouts and prevent burnout.",
            low_activity_high_stress: "A powerful way to combat your high stress levels is through physical activity. Even a 15-minute brisk walk can release endorphins and reduce stress hormones. Think of exercise not as a chore, but as a potent stress-relief tool."
        }
    }
};

const week2 = [
    { day: 8, theme: "Metabolic Boost", icon: "🔥", morning: { task: "Try a high-intensity interval training (HIIT) workout for 10 minutes." }, nutrition: { task: "Add cinnamon to your coffee or oatmeal to help regulate blood sugar." }, activity: { task: "Ensure you hit 8,000 steps today." }, evening: { task: "Avoid eating heavy meals at least 2 hours before bed." } },
    { day: 9, theme: "Gut Health", icon: "🦠", morning: { task: "Incorporate a probiotic source like yogurt or kefir into your breakfast." }, nutrition: { task: "Eat a high-fiber snack, such as an apple or a handful of berries." }, activity: { task: "Perform 15 minutes of core exercises like planks and leg raises." }, evening: { task: "Dim the lights in your home an hour before bed to support melatonin production." } },
    { day: 10, theme: "Brain Power", icon: "🧠", morning: { task: "Challenge your brain with a puzzle like Sudoku or a crossword for 10 minutes." }, nutrition: { task: "Eat a serving of fatty fish (like salmon) or walnuts for Omega-3s." }, activity: { task: "Try a coordination-based activity, like dancing or juggling, for 10 minutes." }, evening: { task: "Write down one new thing you learned today." } },
    { day: 11, theme: "Strength & Stability", icon: "💪", morning: { task: "Hold a plank for as long as you can. Try to beat your time tomorrow." }, nutrition: { task: "Ensure you have a source of protein with every meal today." }, activity: { task: "Focus on your posture. Sit up straight and pull your shoulders back." }, evening: { task: "Gently stretch your major muscle groups before getting into bed." } },
    { day: 12, theme: "Cardio Endurance", icon: "❤️", morning: { task: "Jump rope for 5 minutes, or simply jump in place." }, nutrition: { task: "Eat a banana or a small bowl of oatmeal for energy before your main activity." }, activity: { task: "Do an activity that gets your heart rate up for 30 continuous minutes." }, evening: { task: "Practice deep belly breathing for 3 minutes to calm your nervous system." } },
    { day: 13, theme: "Flexibility & Flow", icon: "🤸", morning: { task: "Try a 10-minute guided yoga session from YouTube." }, nutrition: { task: "Drink green tea, which is rich in antioxidants." }, activity: { task: "Spend 10 minutes foam rolling or stretching tight muscles." }, evening: { task: "Avoid looking at your phone for the first and last 10 minutes of your day." } },
    { day: 14, theme: "Consistent Progress", icon: "📈", morning: { task: "Look back at the last 14 days. What was the most impactful change you made?" }, nutrition: { task: "Batch cook a healthy meal for the start of next week." }, activity: { task: "Plan your workouts for the next 7 days." }, evening: { task: "Set a new, small wellness goal for the upcoming week." } },
];
const week3 = [
    { day: 15, theme: "Advanced Wellness", icon: "🌟", morning: { task: "Practice box breathing (inhale 4s, hold 4s, exhale 4s, hold 4s) for 3 minutes." }, nutrition: { task: "Incorporate a fermented food like yogurt, kefir, or kimchi for gut health." }, activity: { task: "Try a new type of physical activity you've never done before." }, evening: { task: "Reflect on your long-term wellness goals." } },
    { day: 16, theme: "Social Connection", icon: "👥", morning: { task: "Send a thoughtful message to a friend you haven't spoken to in a while." }, nutrition: { task: "Share a healthy meal with someone, even virtually." }, activity: { task: "Go for a walk with a friend or family member." }, evening: { task: "Plan a social activity for the upcoming weekend." } },
    { day: 17, theme: "Digital Detox", icon: "📵", morning: { task: "Keep your phone out of reach for the first hour of your day." }, nutrition: { task: "Eat your breakfast without looking at any screens." }, activity: { task: "Take a 20-minute walk outside without headphones or your phone." }, evening: { task: "Declare the last hour before bed a 'no-screen zone'." } },
    { day: 18, theme: "Advanced Strength", icon: "🏋️", morning: { task: "Perform 3 sets of your most challenging bodyweight exercise (e.g., pull-ups, pistol squats)." }, nutrition: { task: "Consume a protein-rich snack within an hour after your workout." }, activity: { task: "Focus on compound movements like squats, deadlifts, or push-ups." }, evening: { task: "Take a warm bath with Epsom salts to soothe sore muscles." } },
    { day: 19, theme: "Mind-Body Sync", icon: "🧘‍♂️", morning: { task: "Try a 15-minute guided meditation focusing on a body scan." }, nutrition: { task: "Pay attention to your body's hunger and fullness cues all day." }, activity: { task: "Engage in a low-impact activity like swimming or tai chi." }, evening: { task: "Journal for 10 minutes about how you felt physically and emotionally today." } },
    { day: 20, theme: "Creative Expression", icon: "🎨", morning: { task: "Spend 10 minutes journaling, sketching, or playing an instrument." }, nutrition: { task: "Try a new healthy recipe you've never made before." }, activity: { task: "Put on your favorite music and dance for 15 minutes." }, evening: { task: "Read a few pages from a fiction book before sleep." } },
    { day: 21, theme: "Sustaining Momentum", icon: "🚀", morning: { task: "Review the past 21 days and write down the 3 most impactful habits you've built." }, nutrition: { task: "Meal prep two healthy lunches for the start of next week." }, activity: { task: "Create a realistic workout schedule for the next month." }, evening: { task: "Set a new, inspiring wellness goal for the next 30 days." } }
];
reportLibrary.sevenDayPlans.plan_14_day = [...reportLibrary.sevenDayPlans.plan_7_day, ...week2];
reportLibrary.sevenDayPlans.plan_21_day = [...reportLibrary.sevenDayPlans.plan_14_day, ...week3];

// УЛУЧШЕНО: Функция для расчета всех метрик
function calculateMetrics(answers, bioAgeResult) {
    let scores = {};
    
    // Wellness Score (упрощенная, можно усложнить)
    scores.wellnessScore = { value: Math.max(30, Math.min(99, 100 - (bioAgeResult.totalScore * 4))) };
    
    // Stress Score (чем ниже, тем лучше, инвертируем для графика)
    const stressLevel = parseInt(answers.stress, 10);
    scores.stress = { value: (11 - stressLevel) * 10 };

    // Sleep Score
    const sleepMap = { 'Less than 5 hours': 30, '5-6 hours': 60, '7-8 hours': 95, 'More than 8 hours': 85 };
    scores.sleep = { value: sleepMap[answers.sleep] || 50 };

    // Nutrition Score
    const nutritionMap = { "0–1 serving": 30, "2–3 servings": 70, "4–5 servings": 90, "More than 5 servings": 100 };
    const processedMap = { "Daily": 20, "3-4 times a week": 50, "1–2 times a week": 80, "Rarely": 100 };
    scores.nutrition = { value: Math.round((nutritionMap[answers.nutrition] + processedMap[answers.processed_food]) / 2) };

    // Hydration Score
    const hydrationMap = { "1–3 cups": 30, "4–6 cups": 70, "7–9 cups": 95, "10+ cups": 100 };
    scores.hydration = { value: hydrationMap[answers.hydration] || 50 };

    // Activity Score
    const activityMap = { "Rarely / Never": 20, "1–2 times a week": 60, "3–4 times a week": 90, "5+ times a week": 100 };
    scores.activity = { value: activityMap[answers.activity] || 50 };
    
    return scores;
}

// УЛУЧШЕНО: Функция для подбора инсайтов
// /netlify/functions/generate-report-hybrid.js

function generateInsights(answers, metrics) {
    const insights = {};
    const lib = reportLibrary.insights;

    // Stress & Sleep Insight (УЛУЧШЕННАЯ ЛОГИКА)
    if (metrics.stress.value > 70 && metrics.sleep.value > 70) {
        insights.stressSleep = lib.stress_sleep.good_stress_good_sleep;
    } else if (metrics.stress.value < 50 && metrics.sleep.value > 70) {
        insights.stressSleep = lib.stress_sleep.high_stress_good_sleep;
    } else if (metrics.stress.value > 70 && metrics.sleep.value < 70) {
        insights.stressSleep = lib.stress_sleep.low_stress_bad_sleep;
    } else if (metrics.stress.value < 50 && metrics.sleep.value < 70) {
        insights.stressSleep = lib.stress_sleep.high_stress_bad_sleep;
    } else {
        // Вариант по умолчанию для всех средних значений
        insights.stressSleep = "Your stress and sleep levels are in a moderate range. Focusing on consistency in both areas, like a regular sleep schedule and short daily walks, can provide significant wellness benefits.";
    }

    // Nutrition & Hydration Insight
    if (metrics.nutrition.value > 80 && metrics.hydration.value < 70) {
        insights.nutritionHydration = lib.nutrition_hydration.good_nutrition_bad_hydration;
    } else if (metrics.nutrition.value < 60 && metrics.hydration.value < 60) {
        insights.nutritionHydration = lib.nutrition_hydration.poor_nutrition_poor_hydration;
    } else {
        insights.nutritionHydration = "You have a solid foundation in nutrition and hydration. Continue to focus on whole foods and consistent water intake to maintain your results.";
    }

    // Activity Insight
    if (metrics.activity.value > 80 && metrics.sleep.value < 70) {
        insights.activity = lib.activity.high_activity_poor_sleep;
    } else if (metrics.activity.value < 50 && metrics.stress.value < 50) {
        insights.activity = lib.activity.low_activity_high_stress;
    } else {
         insights.activity = "Your activity level is a good starting point. Aim for consistency, and remember that even short walks can have a significant positive impact on your well-being.";
    }
    
    return insights;
}


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
// --- НАЧАЛО ИЗМЕНЕНИЯ ---
// Обновляем статус, чтобы клиент знал, что генерация началась
await sessionRef.update({ reportStatus: 'processing' });
// --- КОНЕЦ ИЗМЕНЕНИЯ ---

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
    const planType = sessionData.planType || 'basic';

    const bioAgeResult = calculateBioAge(chronoAge, answers, faceAnalysis);
    const metrics = calculateMetrics(answers, bioAgeResult);
    const insights = generateInsights(answers, metrics);
    const factors = determineFactors(answers, bioAgeResult);
    const archetype = determineArchetype(answers);
    
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

    // ДОБАВИТЬ ПЕРЕД reportData эти переменные:
const standardLifespan = 82;

// Формируем текстовое объяснение разницы в возрасте
let ageExplanation = '';
if (bioAgeResult.ageCorrection > 0) {
    ageExplanation = `Your biological age is ${bioAgeResult.ageCorrection} years higher than your chronological age. This indicates that certain lifestyle factors are accelerating your aging process. The good news is that our personalized plan can help you reverse this trend.`;
} else if (bioAgeResult.ageCorrection < 0) {
    ageExplanation = `Excellent! Your biological age is ${Math.abs(bioAgeResult.ageCorrection)} years younger than your chronological age. Your healthy habits are paying off, and our plan will help you maintain and improve these results.`;
} else {
    ageExplanation = `Your biological age matches your chronological age. This means you're aging at a normal rate, but there's still room for improvement to potentially reverse your biological clock.`;
}

// Формируем заключение по коже
let skinConclusion = "Skin analysis was not performed.";
if (faceAnalysis && faceAnalysis.faces && faceAnalysis.faces.length > 0) {
    const skinStatus = faceAnalysis.faces[0].attributes.skinstatus;
    let skinIssues = [];
    
    if (skinStatus.dark_circle > 30) skinIssues.push("dark circles");
    if (skinStatus.eye_pouch > 30) skinIssues.push("eye puffiness");
    if (skinStatus.forehead_wrinkle > 20) skinIssues.push("forehead lines");
    if (skinStatus.acne > 10) skinIssues.push("acne");
    
    if (skinIssues.length > 0) {
        skinConclusion = `Your skin analysis reveals some areas for improvement, including ${skinIssues.join(", ")}. These indicators often correlate with stress, sleep quality, and hydration levels.`;
    } else {
        skinConclusion = "Your skin is in excellent condition! Continue with your current skincare routine and healthy habits.";
    }
}

// Получаем URL фото пользователя
const userPhotoUrl = answers.selfie && answers.selfie !== 'skipped' ? answers.selfie : null;

// ТЕПЕРЬ САМ reportData:
const reportData = {
  userName: answers.name || "Valued User",
  chronoAge: chronoAge,
  wellnessAge: bioAgeResult.biologicalAge,
  ageCorrection: bioAgeResult.ageCorrection,
  ageExplanation: ageExplanation, // НОВОЕ ПОЛЕ
  ageReductionPrediction: ageReductionPrediction,
  increasingFactors: factors.increasing,
  decreasingFactors: factors.decreasing,
  metrics: metrics,
  insights: insights,
  skinAnalysis: {
    dark_circle: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.dark_circle || 0,
    eye_pouch: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.eye_pouch || 0,
    forehead_wrinkle: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.forehead_wrinkle || 0,
    acne: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.acne || 0,
    skin_spot: faceAnalysis?.faces?.[0]?.attributes?.skinstatus?.skin_spot || 0
  },
  skinConclusion: skinConclusion, // НОВОЕ ПОЛЕ
  userPhotoUrl: userPhotoUrl, // НОВОЕ ПОЛЕ
  archetype: archetype,
  sevenDayPlan: plan,
  potential: { // НОВОЕ ПОЛЕ
    age: bioAgeResult.biologicalAge - (planType === 'premium' ? 3 : planType === 'advanced' ? 2 : 1),
    lifespan: standardLifespan + (planType === 'premium' ? 5 : planType === 'advanced' ? 4 : 2)
  }
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

