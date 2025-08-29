const axios = require('axios');
const querystring = require('querystring');

// URL для обнаружения лица (остается v3, так как это стандартный шаг)
const DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';

// URL для анализа кожи (версия v1, как вы указали)
// ПРИМЕЧАНИЕ: Этот API может быть устаревшим. Рекомендуется проверить наличие v3 эквивалента.
const SKIN_ANALYZE_URL = 'https://api-us.faceplusplus.com/facepp/v1/skinanalyze';

exports.handler = async (event) => {
  // 1. Проверяем, что это POST-запрос
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 2. Получаем данные фото из тела запроса
    const { photoDataUrl } = JSON.parse(event.body);
    if (!photoDataUrl) {
      return { statusCode: 400, body: 'Photo data is required' };
    }

    // Извлекаем изображение в формате base64
    const base64Image = photoDataUrl.split(';base64,').pop();

    // --- ШАГ A: Обнаружение лица для получения face_token ---
    const detectFormData = {
      api_key: process.env.FACEPLUSPLUS_API_KEY,
      api_secret: process.env.FACEPLUSPLUS_API_SECRET,
      image_base64: base64Image,
    };

    const detectResponse = await axios.post(DETECT_URL, querystring.stringify(detectFormData));

    if (!detectResponse.data.faces || detectResponse.data.faces.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No face detected' }) };
    }

    const faceToken = detectResponse.data.faces[0].face_token;

    // --- ШАГ B: Анализ кожи с использованием полученного face_token ---
    const skinAnalyzeFormData = {
      api_key: process.env.FACEPLUSPLUS_API_KEY,
      api_secret: process.env.FACEPLUSPLUS_API_SECRET,
      face_token: faceToken, // API v1 использует face_token, а не face_tokens
    };

    const skinResponse = await axios.post(SKIN_ANALYZE_URL, querystring.stringify(skinAnalyzeFormData));
    
    // 3. Возвращаем успешный результат анализа кожи
    return {
      statusCode: 200,
      body: JSON.stringify(skinResponse.data),
    };

  } catch (error) {
    // 4. Обрабатываем возможные ошибки
    const errorMessage = error.response ? error.response.data : error.message;
    console.error('Face++ API Error:', errorMessage);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: errorMessage }),
    };
  }
};
