const axios = require('axios');
const querystring = require('querystring');

// API эндпоинт для Face++
const FACEPP_DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { photoDataUrl } = JSON.parse(event.body);

    if (!photoDataUrl) {
      return { statusCode: 400, body: 'Photo data is required' };
    }

    // Убираем префикс 'data:image/jpeg;base64,'
    const base64Image = photoDataUrl.split(';base64,').pop();

    const formData = {
      api_key: process.env.FACEPLUSPLUS_API_KEY,
      api_secret: process.env.FACEPLUSPLUS_API_SECRET,
      image_base64: base64Image,
      return_attributes: 'gender,age,emotion,facialhair,glasses,smile'
    };

    // Face++ ожидает данные в формате application/x-www-form-urlencoded
    const response = await axios.post(FACEPP_DETECT_URL, querystring.stringify(formData), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.data.faces.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No face detected' }) };
    }

    // Структурируем ответ, чтобы он был похож на предыдущий (от Azure)
    // Это важно для совместимости с функцией generateReport
    const faceAttributes = response.data.faces[0].attributes;

    const analysisResult = {
      age: faceAttributes.age.value,
      gender: faceAttributes.gender.value,
      smile: faceAttributes.smile.value > faceAttributes.smile.threshold,
      facialHair: faceAttributes.facialhair,
      glasses: faceAttributes.glass.value,
      emotion: faceAttributes.emotion
    };

    return {
      statusCode: 200,
      body: JSON.stringify(analysisResult),
    };

  } catch (error) {
    console.error('Face++ API Error:', error.response ? error.response.data : error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not analyze photo with Face++' }),
    };
  }
};
