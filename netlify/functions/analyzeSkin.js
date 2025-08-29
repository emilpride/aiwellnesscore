const axios = require('axios');
const querystring = require('querystring');

// URL для анализа кожи (версия v1, как вы указали)
const SKIN_ANALYZE_URL = 'https://api-us.faceplusplus.com/facepp/v1/skinanalyze';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { photoDataUrl } = JSON.parse(event.body);
    if (!photoDataUrl) {
      return { statusCode: 400, body: 'Photo data is required' };
    }

    const base64Image = photoDataUrl.split(';base64,').pop();

    // Формируем данные для запроса напрямую к Skin Analyze API
    const skinAnalyzeFormData = {
      api_key: process.env.FACEPLUSPLUS_API_KEY,
      api_secret: process.env.FACEPLUSPLUS_API_SECRET,
      image_base64: base64Image, // Отправляем изображение напрямую
    };

    // Отправляем запрос
    const skinResponse = await axios.post(SKIN_ANALYZE_URL, querystring.stringify(skinAnalyzeFormData));
    
    // Возвращаем результат
    return {
      statusCode: 200,
      body: JSON.stringify(skinResponse.data),
    };

  } catch (error) {
    const errorMessage = error.response ? error.response.data : error.message;
    console.error('Face++ API Error:', errorMessage);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: errorMessage }),
    };
  }
};
