// /netlify/functions/getProfileData.js

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Подключаем вашу логику скоринга, чтобы анализировать ответы
const { bioAgeScoring } = require('./bio-age-calculation.js');

// Инициализация Firebase Admin SDK
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error("Firebase init error in getProfileData.js:", e);
  }
}
const db = getFirestore();

// --- Логика для генерации текстовых данных на основе ответов ---

// Функция для определения архетипа
function getWellnessArchetype(answers) {
    const stress = parseInt(answers.stress, 10) || 5;
    const activity = answers.activity || "";
    const sleep = answers.sleep || "";
    const screen_time = answers.screen_time || "";

    if (stress > 7 && (activity.includes('3-4') || activity.includes('5+'))) {
        return { name: 'The Driven Achiever', description: 'You excel at work and stay active, but high stress and lack of sleep are holding you back from your full potential.' };
    }
    if (sleep.includes('Less than 5') && screen_time.includes('More than 6')) {
        return { name: 'The Digital Night Owl', description: 'Your habits suggest you are highly connected, but this may be impacting your sleep quality and accelerating aging.' };
    }
    if (answers.nutrition?.includes('More than 5') && answers.mindfulness === 'Daily') {
        return { name: 'The Zen Master', description: 'You have a strong foundation in nutrition and mindfulness, putting you on a great path for healthy aging.' };
    }
    return { name: 'The Balanced Individual', description: 'You have a mix of healthy and improvable habits, providing a solid base to build upon for better wellness.' };
}

// Функция для определения ключевой области для улучшения
function getFocusArea(scoredFactors) {
    const worstFactor = scoredFactors.negative[0]; // Берем фактор с самым большим негативным вкладом
    if (!worstFactor) return { name: 'Overall Balance', description: 'Your habits are well-rounded. Focusing on consistency across all areas will yield the best results.'};

    const focusMap = {
        smoking: { name: 'Smoking Cessation', description: 'Quitting smoking is the single most effective way to improve your biological age and overall health.' },
        stress: { name: 'Stress Management', description: 'Lowering your stress is a highly effective way to improve your biological age and well-being.' },
        processed_food: { name: 'Nutrition Improvement', description: 'Reducing processed foods can significantly lower inflammation and improve your wellness score.' },
        sleep: { name: 'Sleep Quality', description: 'Improving your sleep is foundational for recovery, mental clarity, and healthy aging.' },
        activity: { name: 'Consistent Activity', description: 'Making exercise a regular habit will greatly benefit your cardiovascular health and longevity.'}
    };
    return focusMap[worstFactor.key] || { name: 'Lifestyle Habits', description: `Focusing on your ${worstFactor.key.replace('_', ' ')} will have a great impact on your results.` };
}

// Функция для получения топ-3 положительных и отрицательных факторов
function getFactors(answers) {
    const scored = [];
    
    // Собираем все факторы и их "очки"
    for (const key in answers) {
        if (bioAgeScoring[key] && bioAgeScoring[key][answers[key]]) {
            const score = bioAgeScoring[key][answers[key]];
            scored.push({ key, answer: answers[key], score });
        }
    }
    // Отдельно обрабатываем стресс
    const stressLevel = parseInt(answers.stress, 10);
    let stressScore = 0;
    if (stressLevel >= 7) stressScore = (stressLevel >= 9) ? 2 : 1;
    if (stressScore > 0) scored.push({ key: 'stress', answer: `Level ${stressLevel}`, score: stressScore });

    // Сортируем: чем выше score, тем хуже
    scored.sort((a, b) => b.score - a.score);

    const positive = scored.filter(f => f.score < 0).slice(0, 3);
    const negative = scored.filter(f => f.score > 0).slice(0, 3);
    
    // Карта для красивого отображения текста
    const textMap = {
        positive: {
            activity: (val) => ({ text: `Exercising ${val}`, icon: '🏃', detail: 'Regular exercise boosts cardiovascular health and reduces stress.' }),
            nutrition: (val) => ({ text: `Eating ${val} servings of fruits/veg`, icon: '🥗', detail: 'A nutrient-rich diet is vital for cellular health.' }),
            mindfulness: (val) => ({ text: `${val} mindfulness practice`, icon: '🧘', detail: 'Helps to lower stress and improve focus.' }),
            sun_protection: (val) => ({ text: `${val} use of SPF`, icon: '☀️', detail: 'Protects your skin from premature aging.' })
        },
        negative: {
            sleep: (val) => ({ text: `${val} of sleep per night`, icon: '😴', detail: 'Lack of sleep impairs recovery and cognitive function.' }),
            processed_food: (val) => ({ text: `${val} consumption of processed food`, icon: '🍔', detail: 'Can lead to inflammation and impact gut health.' }),
            stress: (val) => ({ text: `High stress levels (${val})`, icon: '😟', detail: 'Chronic stress accelerates cellular aging.' }),
            smoking: (val) => ({ text: `${val} smoking`, icon: '🚭', detail: 'The single largest factor in premature aging.' }),
            alcohol: (val) => ({ text: `${val} alcoholic drinks per week`, icon: '🍺', detail: 'Impacts sleep quality and liver health.' })
        }
    };

    return {
        positive: positive.map(f => textMap.positive[f.key] ? textMap.positive[f.key](f.answer) : null).filter(Boolean),
        negative: negative.map(f => textMap.negative[f.key] ? textMap.negative[f.key](f.answer) : null).filter(Boolean)
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

    const sessionRef = db.collection('sessions').doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Profile data not found.' }) };
    }
    const sessionData = doc.data();
    const answers = sessionData.answers || {};
    const preliminaryResult = sessionData.preliminaryResult || {};
    
    // --- Генерируем динамический контент ---
    const factors = getFactors(answers);
    const wellnessArchetype = getWellnessArchetype(answers);
    const focusArea = getFocusArea(factors);
    
    // --- Формируем финальный объект для отправки на фронтенд ---
    const responseData = {
        userPhotoUrl: (answers.selfie && answers.selfie !== 'skipped') ? answers.selfie : null,
        gender: answers.gender || 'female', // Default to female for image assets if not specified
        chronoAge: parseInt(answers.age, 10) || 0,
        bioAgeResult: preliminaryResult,
        bmi: { value: preliminaryResult.bmiValue || 0 }, // Предполагаем, что BMI считается в preliminaryResult
        wellnessArchetype,
        focusArea,
        factors,
    };
    
    // Рассчитываем BMI, если он не был сохранен отдельно
    if (!responseData.bmi.value && answers.height && answers.weight) {
        const heightM = parseFloat(answers.height) / 100;
        const weightKg = parseFloat(answers.weight);
        if (heightM > 0 && weightKg > 0) {
           responseData.bmi.value = parseFloat((weightKg / (heightM * heightM)).toFixed(1));
        }
    }


    return {
      statusCode: 200,
      body: JSON.stringify(responseData),
    };

  } catch (error) {
    console.error('Error in getProfileData:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
