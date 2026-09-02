// api/share-concepts.js

const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      message: 'Use POST.'
    });
  }

  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body || {};

    const imageData = body.imageData;
    const sessionId =
      String(body.sessionId || Date.now())
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 80);

    if (
      typeof imageData !== 'string' ||
      !imageData.startsWith('data:image/jpeg;base64,')
    ) {
      return res.status(400).json({
        message: 'A valid concept-sheet image is required.'
      });
    }

    const base64 = imageData.split(',')[1];

    if (!base64 || base64.length > 6_000_000) {
      return res.status(400).json({
        message: 'The concept sheet is too large.'
      });
    }

    const imageBuffer = Buffer.from(base64, 'base64');

    const blob = await put(
     `noggin-designs-${Date.now().toString(36)}.jpg`,
      imageBuffer,
      {
        access: 'public',
        contentType: 'image/jpeg',
        addRandomSuffix: false
      }
    );

    return res.status(200).json({
      url: blob.url
    });
  } catch (error) {
    console.error('Concept sheet upload failed:', error);

    return res.status(500).json({
      message: 'The concept sheet could not be saved.',
      debug: String(error && error.message ? error.message : error)
    });
  }
};
