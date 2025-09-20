const axios = require('axios');
const FormData = require('form-data');

const SKIN_API_URL = 'https://api-cn.faceplusplus.com/facepp/v1/skinanalyze_pro';

const PLAN_CONFIG = {
  basic: {
    price: '$1',
    description: "A quick snapshot of your skin's health with core metrics.",
    return_maps: '',
    return_marks: '',
    expectedMaps: [],
    expectedMarks: []
  },
  advanced: {
    price: '$5',
    description: 'Detailed metrics, severity scores, and visual overlays.',
    return_maps: 'red_area,brown_area,water_area,texture_enhanced_pores,texture_enhanced_blackheads',
    return_marks: 'melanin_mark,sensitivity_mark,blackheads_mark,pores_mark',
    expectedMaps: ['red_area', 'brown_area', 'water_area', 'texture_enhanced_pores', 'texture_enhanced_blackheads'],
    expectedMarks: ['melanin_mark', 'sensitivity_mark', 'blackheads_mark', 'pores_mark']
  },
  pro: {
    price: '$9',
    description: 'The full dermatologist-inspired breakdown with coordinates and overlays.',
    return_maps: 'red_area,brown_area,water_area,texture_enhanced_pores,texture_enhanced_blackheads,texture_enhanced_lines,rough_area,roi_outline_map',
    return_marks: 'melanin_mark,sensitivity_mark,blackheads_mark,pores_mark,wrinkle_mark,dark_circle_outline',
    expectedMaps: [
      'red_area',
      'brown_area',
      'water_area',
      'texture_enhanced_pores',
      'texture_enhanced_blackheads',
      'texture_enhanced_lines',
      'rough_area',
      'roi_outline_map'
    ],
    expectedMarks: ['melanin_mark', 'sensitivity_mark', 'blackheads_mark', 'pores_mark', 'wrinkle_mark', 'dark_circle_outline']
  }
};

function normaliseDataUrl(value, fallbackMime = 'image/png') {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('data:image')) return value;
  return `data:${fallbackMime};base64,${value}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Method Not Allowed' };
  }

  if (!process.env.FACEPLUSPLUS_API_KEY || !process.env.FACEPLUSPLUS_API_SECRET) {
    console.error('Face++ API credentials are missing.');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Skin analysis service is not configured.' })
    };
  }

  try {
    const { imageDataUrl, plan = 'basic', returnMapsOverride, returnMarksOverride } = JSON.parse(event.body || '{}');

    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'imageDataUrl is required.' })
      };
    }

    if (!/^data:image\//i.test(imageDataUrl)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'imageDataUrl must be a valid data URI.' })
      };
    }

    const base64Part = imageDataUrl.split(';base64,').pop();
    if (!base64Part) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid image data provided.' })
      };
    }

    const approxBytes = Math.max(0, Math.ceil((base64Part.length * 3) / 4) - (base64Part.endsWith('==') ? 2 : base64Part.endsWith('=') ? 1 : 0));
    if (approxBytes > 8 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Image is too large. Maximum size is 8 MB.' })
      };
    }

    const planConfig = PLAN_CONFIG[plan] || PLAN_CONFIG.basic;

    const form = new FormData();
    form.append('api_key', process.env.FACEPLUSPLUS_API_KEY);
    form.append('api_secret', process.env.FACEPLUSPLUS_API_SECRET);
    form.append('image_base64', base64Part);

    const maps = typeof returnMapsOverride === 'string' ? returnMapsOverride : planConfig.return_maps;
    const marks = typeof returnMarksOverride === 'string' ? returnMarksOverride : planConfig.return_marks;

    if (maps) {
      form.append('return_maps', maps);
    }
    if (marks) {
      form.append('return_marks', marks);
    }

    // Allow future extension for side images & ROI colors via overrides
    if (event.queryStringParameters?.return_side_results) {
      form.append('return_side_results', event.queryStringParameters.return_side_results);
    }

    const response = await axios.post(SKIN_API_URL, form, {
      headers: form.getHeaders(),
      timeout: 20000
    });

    const payload = response.data || {};
    const result = payload.result || {};

    const mapPayload = [];
    const markPayload = {};

    const expectedMapKeys = planConfig.expectedMaps || [];
    expectedMapKeys.forEach((key) => {
      const raw = result[key] || result?.return_maps?.[key];
      const normalised = normaliseDataUrl(raw);
      if (normalised) {
        mapPayload.push({ type: key, dataUrl: normalised });
      }
    });

    const expectedMarkKeys = planConfig.expectedMarks || [];
    expectedMarkKeys.forEach((key) => {
      const value = result[key] || result?.return_marks?.[key];
      if (value) {
        markPayload[key] = value;
      }
    });

    const responseBody = {
      plan,
      price: planConfig.price,
      description: planConfig.description,
      result,
      maps: mapPayload,
      marks: markPayload,
      score_info: result.score_info,
      image_quality: result.image_quality,
      meta: {
        time_used: payload.time_used,
        face_rectangle: payload.face_rectangle,
        request_id: payload.request_id
      }
    };

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(responseBody)
    };
  } catch (error) {
    console.error('Face++ skin analyze error:', error.response?.data || error.message || error);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error_message || error.message || 'Failed to analyze skin.';
    return {
      statusCode: status,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: message })
    };
  }
};
