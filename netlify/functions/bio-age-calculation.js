// File: /bio-age-calculation.js

/**
 * @description Contains the scoring system for the biological age calculation.
 * Positive scores "add age", while negative scores "reduce age".
 */
const bioAgeScoring = {
  // Questionnaire Data
  sleep: {
    '7-8 hours': 0,
    '5-6 hours': 1,
    'More than 8 hours': 1,
    'Less than 5 hours': 2
  },
  activity: {
    '5+ times': -1,
    '3-4 times': 0,
    '1-2 times': 1,
    'Rarely': 2
  },
  nutrition: { // Corresponds to fruit and vegetable servings
    'More than 5': -1,
    '4-5': 0,
    '2-3': 1,
    '0-1': 2
  },
  processed_food: {
    'Rarely': 0,
    '1-2 times': 1,
    '3-4 times': 2,
    'Daily': 3
  },
  hydration: {
    '10+ glasses': -1,
    '7-9 glasses': 0,
    '4-6 glasses': 1,
    '1-3 glasses': 2
  },
  mindfulness: {
    'Daily': -1,
    'Weekly': 0,
    'Occasionally': 1,
    'Never': 2
  },
  mood: {
    'Happy & Energetic': -1,
    'Generally Content': 0,
    'It varies a lot': 1,
    'Often Stressed or Sad': 2
  },
  alcohol: {
    '0': 0,
    '1-3': 1,
    '4-7': 2,
    '8+': 3
  },
  smoking: {
    'No, never': 0,
    'Used to, but quit': 1,
    'Occasionally': 2,
    'Yes, daily': 3
  },
  screen_time: {
    'Less than 2 hours': 0,
    '2-4 hours': 1,
    '4-6 hours': 2,
    'More than 6 hours': 3
  },
  genetics: {
    '85+ years': -2,
    '75-85 years': -1,
    '65-75 years': 0,
    '<65 years': 1
  },
  chronic: {
    'None': 0,
    'Mild': 1,
    'Serious': 2
  },
  sun_protection: {
    'Daily SPF': -1,
    'Sometimes': 0,
    'Never': 1
  },

  // Photo Analysis (keys correspond to Face++ API)
  photoAnalysis: {
    eye_pouch: 2,
    dark_circle: 2,
    eye_finelines: 1,
    crows_feet: 2,
    forehead_wrinkle: 2,
    glabella_wrinkle: 2,
    nasolabial_fold: 2,
    blackhead: 1,
    acne: 1,
    skin_spot: 2 // Pigment spots
  }
};

/**
 * @description Calculates the biological age based on chronological age, quiz answers, and photo analysis.
 * @param {number} chronoAge - The user's chronological age.
 * @param {object} userAnswers - An object with the user's answers (key: answer).
 * @param {object} [faceAnalysisResult] - The result object from the Face++ API.
 * @returns {{biologicalAge: number, totalScore: number, ageCorrection: number}} - An object with the results.
 */
function calculateBioAge(chronoAge, userAnswers, faceAnalysisResult) {
  let totalScore = 0;

  // *** ВОТ ЛОГИКА ДЛЯ BMI ***
  // 1. Calculate BMI from height and weight
  const heightM = parseFloat(userAnswers.height) / 100;
  const weightKg = parseFloat(userAnswers.weight);
  if (heightM > 0 && weightKg > 0) {
    const bmi = weightKg / (heightM * heightM);
    if (bmi < 18.5 || (bmi >= 25 && bmi < 30)) {
      totalScore += 1; // Underweight/Overweight -> +1 point
    } else if (bmi >= 30) {
      totalScore += 2; // Obese -> +2 points
    }
    // For normal range (18.5-24.9), no points are added (0).
  }

  // 2. Tally scores from questionnaire answers
  for (const key in userAnswers) {
    if (bioAgeScoring[key] && bioAgeScoring[key][userAnswers[key]]) {
      totalScore += bioAgeScoring[key][userAnswers[key]];
    }
  }

  // *** ВОТ ЛОГИКА ДЛЯ СТРЕССА ***
  // 2.1. Special handling for the stress slider
  const stressLevel = parseInt(userAnswers.stress, 10);
  if (stressLevel >= 1 && stressLevel <= 3) {
    totalScore -= 1; // Range 1-3 -> -1 point
  } else if (stressLevel >= 7 && stressLevel <= 8) {
    totalScore += 1; // Range 7-8 -> +1 point
  } else if (stressLevel >= 9 && stressLevel <= 10) {
    totalScore += 2; // Range 9-10 -> +2 points
  }
  // For range 4-6, no points are added (0).


  // 3. Tally scores from photo analysis
  if (faceAnalysisResult && faceAnalysisResult.faces && faceAnalysisResult.faces.length > 0) {
    const skinStatus = faceAnalysisResult.faces[0].attributes.skinstatus;
    const thresholds = {
      eye_pouch: 30, dark_circle: 30, eye_finelines: 20, crows_feet: 20,
      forehead_wrinkle: 20, glabella_wrinkle: 20, nasolabial_fold: 20,
      blackhead: 10, acne: 10, skin_spot: 10
    };

    for (const key in bioAgeScoring.photoAnalysis) {
      if (skinStatus[key] && skinStatus[key] > thresholds[key]) {
        totalScore += bioAgeScoring.photoAnalysis[key];
      }
    }
  }

  // 4. Calculate age correction based on the total score
  let ageCorrection = 0;
  if (totalScore <= -5) {
    ageCorrection = -7; // Represents "younger by 5-10 years"
  } else if (totalScore >= -4 && totalScore <= -1) {
    ageCorrection = -3; // Represents "younger by 2-4 years"
  } else if (totalScore >= 0 && totalScore <= 3) {
    ageCorrection = 0; // Corresponds to age
  } else if (totalScore >= 4 && totalScore <= 7) {
    ageCorrection = 3; // Represents "older by 2-4 years"
  } else if (totalScore >= 8 && totalScore <= 12) {
    ageCorrection = 6; // Represents "older by 5-7 years"
  } else if (totalScore >= 13) {
    ageCorrection = 10; // Represents "older by 10+ years"
  }

  const biologicalAge = chronoAge + ageCorrection;

  return {
    biologicalAge: biologicalAge,
    totalScore: totalScore,
    ageCorrection: ageCorrection
  };
}
