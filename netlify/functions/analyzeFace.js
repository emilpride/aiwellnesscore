const axios = require('axios');
const querystring = require('querystring');

const DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';
const ANALYZE_URL = 'https://api-us.faceplusplus.com/facepp/v3/face/analyze';

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

    const detectFormData = {
      api_key: process.env.FACEPLUSPLUS_API_KEY,
      api_secret: process.env.FACEPLUSPLUS_API_SECRET,
      image_base64: base64Image,
    };

    const detectResponse = await axios.post(DETECT_URL, querystring.stringify(detectFormData));

    if (!detectResponse.data.faces || detectResponse.data.faces.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No face detected in Step 1' }) };
    }

    const faceToken = detectResponse.data.faces[0].face_token;

    const analyzeFormData = {
      api_key: process.env.FACEPLUSPLUS_API_KEY,
      api_secret: process.env.FACEPLUSPLUS_API_SECRET,
      face_tokens: faceToken,
      return_attributes: 'gender,age,smiling,emotion,glasses'
    };

    const analyzeResponse = await axios.post(ANALYZE_URL, querystring.stringify(analyzeFormData));

    if (!analyzeResponse.data.faces || analyzeResponse.data.faces.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Could not analyze the detected face in Step 2' }) };
    }

    const faceAttributes = analyzeResponse.data.faces[0].attributes;

    const analysisResult = {
      age: faceAttributes.age.value,
      gender: faceAttributes.gender.value,
      smile: faceAttributes.smiling.value > faceAttributes.smiling.threshold,
      glasses: faceAttributes.glass.value,
      emotion: faceAttributes.emotion
    };

    return {
      statusCode: 200,
      body: JSON.stringify(analysisResult),
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
