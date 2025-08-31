// /netlify/functions/analyzeSkin.js

const axios = require('axios');
const querystring = require('querystring');

const FACE_DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Проверяем наличие API ключей
    if (!process.env.FACEPLUSPLUS_API_KEY || !process.env.FACEPLUSPLUS_API_SECRET) {
      console.error('Face++ API keys are not configured.');
      // --- ИЗМЕНЕНИЕ: Вместо заглушки возвращаем ошибку ---
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'The face analysis service is not configured.' }) 
      };
    }

    const { photoDataUrl } = JSON.parse(event.body);
    if (!photoDataUrl) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Photo data is required' }) };
    }

    const base64Image = photoDataUrl.split(';base64,').pop();

    const formData = {
      api_key: process.env.FACEPLUSPLUS_API_KEY,
      api_secret: process.env.FACEPLUSPLUS_API_SECRET,
      image_base64: base64Image,
      return_attributes: 'gender,age,smiling,eyestatus,emotion,beauty,skinstatus'
    };

    const response = await axios.post(FACE_DETECT_URL, querystring.stringify(formData), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000 // 10 секунд таймаут
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
    };

  } catch (error) {
    console.error('Face++ API Error:', error.message);
    // --- ИЗМЕНЕНИЕ: Вместо заглушки возвращаем ошибку ---
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to analyze skin from the photo.',
        details: error.message
      })
    };
  }
};
