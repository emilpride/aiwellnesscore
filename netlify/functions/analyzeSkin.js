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

    // Validate that input is an image data URL and limit size (~4MB)
    if (!/^data:image\//i.test(photoDataUrl)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Only image data URLs are accepted.' }) };
    }
    const base64Part = photoDataUrl.split(';base64,').pop();
    if (!base64Part) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image data' }) };
    }
    const approxBytes = Math.max(0, Math.ceil((base64Part.length * 3) / 4) - (base64Part.endsWith('==') ? 2 : base64Part.endsWith('=') ? 1 : 0));
    if (approxBytes > 4 * 1024 * 1024) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Image is too large. Max 4MB.' }) };
    }

    const base64Image = base64Part;

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
