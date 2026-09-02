// api/generate.js
//
// POST /api/generate
// Body: application/json — {
//   logoBase64: "data:image/png;base64,...",
//   logoMimeType: "image/png",
//   capDesigns: [{
//     frontColor, sideColor, peakColor, eyeletColor, topButtonColor,
//     nogginLogoColor
//   }],
//   tier ("1" | "2"), sessionId, email (tier 2 only)
// }
//
// This deliberately sends the logo as base64 text inside a plain JSON body,
// rather than a raw multipart/form-data file upload. After extensive
// testing, requests WITHOUT a file worked correctly against the deployed
// function, but requests WITH an actual binary file consistently failed
// with no error information at all — pointing at something in how
// Vercel's platform handles raw multipart/binary request bodies
// specifically, rather than anything in our own code (verified working
// correctly, with real files, in local simulation). Sending the file as
// base64 text inside JSON avoids multipart parsing entirely, which is a
// well-established, more portable pattern for exactly this situation.
//
// Produces 8 renders per free set: 3 beanies, 2 caps, 3 bucket hats — each
// using the customer's actual uploaded logo and their two chosen colours,
// rendered from Noggin's real Photoshop templates via SudoMock. See
// _mockup-config.js for exactly which layer gets which colour.

const EXTERNAL_CALL_TIMEOUT_MS = 15000;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
  }

  let kv, put, getMockup, render, findSmartObjectByName, findOptionalSmartObjectByName, buildBandImage, buildCapArtwork, prepareCustomerLogoBuffer, PRODUCTS, PRODUCT_VARIATIONS;
  try {
    ({ kv } = require('@vercel/kv'));
    ({ put } = require('@vercel/blob'));
    ({ getMockup, render, findSmartObjectByName, findOptionalSmartObjectByName } = require('./_sudomock-client'));
    ({ buildBandImage } = require('./_build-band'));
    ({ buildCapArtwork, prepareCustomerLogoBuffer } = require('./_build-cap-artwork'));
    ({ PRODUCTS, PRODUCT_VARIATIONS } = require('./_mockup-config'));
  } catch (err) {
    console.error('DEPENDENCY LOAD FAILURE:', err);
    return res.status(500).json({ code: 'DEPENDENCY_ERROR', message: 'A required module failed to load on the server.', debug: String((err && err.stack) || err) });
  }

  try {
    return await handlePost(req, res, { kv, put, getMockup, render, findSmartObjectByName, findOptionalSmartObjectByName, buildBandImage, buildCapArtwork, prepareCustomerLogoBuffer, PRODUCTS, PRODUCT_VARIATIONS });
  } catch (err) {
    console.error('UNCAUGHT top-level error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong generating your mock-ups.', debug: String((err && err.stack) || err) });
    }
  }
};

async function handlePost(req, res, deps) {
  const { kv, put, getMockup, render, findSmartObjectByName, findOptionalSmartObjectByName, buildBandImage, buildCapArtwork, prepareCustomerLogoBuffer, PRODUCTS, PRODUCT_VARIATIONS } = deps;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    console.error('Body parsing failed:', err);
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'Could not read request body.', debug: String((err && err.message) || err) });
  }

  const sessionId = String(body.sessionId || '').trim();
  const tier = String(body.tier || '1').trim();
  const email = body.email ? String(body.email).trim() : null;
  // The current Shopify cap UI sends capDesigns rather than the legacy
  // primaryColor/secondaryColor fields. Reuse Concept 1's front and accent
  // colours for beanies so both products work from the same submission.
  const firstSubmittedCapDesign = Array.isArray(body.capDesigns) ? body.capDesigns[0] || {} : {};
  const primaryColor = String(
    body.primaryColor || body.frontColor || firstSubmittedCapDesign.frontColor || ''
  ).trim();
  const secondaryColor = String(
    body.secondaryColor ||
    body.sideColor ||
    firstSubmittedCapDesign.eyeletColor ||
    firstSubmittedCapDesign.peakColor ||
    primaryColor
  ).trim();
  // Cap controls are independent. Legacy primary/secondary values remain as
  // fallbacks until the Shopify draft is switched to the three new controls.
  const frontColor = String(body.frontColor || primaryColor).trim();
  const sideColor = String(body.sideColor || secondaryColor || primaryColor).trim();
  const peakColor = String(body.peakColor || secondaryColor || primaryColor).trim();
  const nogginLogoColor = String(body.nogginLogoColor || '#FFFFFF').trim();
  // When Shopify sends the two colours detected from the uploaded logo,
  // these are the three approved Noggin starting concepts. Shopify can
  // still send capDesigns to override any individual field after the
  // customer changes a colour picker.
  const presetCapDesigns = [
    {
      frontColor,
      sideColor: frontColor,
      peakColor: frontColor,
      eyeletColor: secondaryColor || frontColor,
      topButtonColor: secondaryColor || frontColor,
      nogginLogoColor: secondaryColor || '#FFFFFF',
    },
    {
      frontColor,
      sideColor: frontColor,
      peakColor: secondaryColor || frontColor,
      eyeletColor: secondaryColor || frontColor,
      topButtonColor: secondaryColor || frontColor,
      nogginLogoColor: secondaryColor || '#FFFFFF',
    },
    {
      frontColor: secondaryColor || frontColor,
      sideColor: secondaryColor || frontColor,
      peakColor: secondaryColor || frontColor,
      eyeletColor: frontColor,
      topButtonColor: frontColor,
      nogginLogoColor: frontColor,
    },
  ];
  const submittedCapDesigns = Array.isArray(body.capDesigns) && body.capDesigns.length
    ? body.capDesigns.slice(0, 3)
    : presetCapDesigns;
  const capDesigns = submittedCapDesigns.map((design) => {
    const designFront = String(design.frontColor || frontColor).trim();
    return {
      frontColor: designFront,
      sideColor: String(design.sideColor || designFront).trim(),
      peakColor: String(design.peakColor || designFront).trim(),
      eyeletColor: String(design.eyeletColor || designFront).trim(),
      topButtonColor: String(design.topButtonColor || designFront).trim(),
      nogginLogoColor: String(design.nogginLogoColor || '#FFFFFF').trim(),
    };
  });
  const logoBase64 = body.logoBase64;
  const logoMimeType = body.logoMimeType || 'image/png';

  if (!sessionId) return res.status(400).json({ code: 'BAD_REQUEST', message: 'Missing session.' });
  if (!logoBase64) {
    // Diagnostic info — shows exactly what the server actually received,
    // so we can see if the body was parsed correctly but this one field
    // was missing, or if something more fundamental went wrong.
    return res.status(400).json({
      code: 'BAD_REQUEST',
      message: 'Missing logo file.',
      debug: {
        receivedKeys: Object.keys(body || {}),
        bodyType: typeof body,
        sessionIdReceived: sessionId,
        logoBase64Type: typeof body.logoBase64,
        rawBodyPreview: JSON.stringify(body).slice(0, 200),
      },
    });
  }
  const validHex = (value) => /^#[0-9A-Fa-f]{6}$/.test(value);
  if (!capDesigns.every((design) => Object.values(design).every(validHex))) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'All cap colours must be six-digit hex values, e.g. #4F6B3F.' });
  }
  if (tier === '2' && !email) {
    return res.status(400).json({ code: 'EMAIL_REQUIRED', message: 'Add your email to unlock more designs.' });
  }

  let logoBuffer;
  try {
    const base64Data = logoBase64.replace(/^data:[^;]+;base64,/, '');
    logoBuffer = Buffer.from(base64Data, 'base64');
    if (logoBuffer.length === 0) throw new Error('Decoded logo is empty.');
  } catch (err) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'Could not decode logo image.', debug: String((err && err.message) || err) });
  }

  const usageKey = `noggin:mockup:${sessionId}`;
  let usage;
  try {
    usage = (await withTimeout(kv.get(usageKey), EXTERNAL_CALL_TIMEOUT_MS, 'Checking session storage')) || { tier1Used: false, tier2Used: false };
  } catch (err) {
    console.error('KV read failed:', err);
    return res.status(502).json({ code: 'STORAGE_ERROR', message: 'Could not reach session storage.', debug: String((err && err.message) || err) });
  }

  if (tier === '1' && usage.tier1Used) {
    return res.status(429).json({ code: 'LIMIT_REACHED', message: "You've already used your free set for this session. Add your email for more." });
  }
  if (tier === '2' && usage.tier2Used) {
    return res.status(429).json({ code: 'LIMIT_REACHED', message: "You've already unlocked your second set for this session." });
  }

  let logoUrl;
let bucketHatLogoUrl;
  try {
    // Generic headwear Smart Objects receive a tightly cropped transparent
    // PNG, preventing flat JPG/PNG backgrounds from appearing as a box.
    const preparedLogoBuffer = await prepareCustomerLogoBuffer(logoBuffer);
const bucketHatLogoBuffer = await prepareCustomerLogoBuffer(
  logoBuffer,
  0.50,
  4120 / 1408
);
const timestamp = Date.now();

const blob = await withTimeout(
  put(`logos/${sessionId}-${timestamp}.png`, preparedLogoBuffer, { access: 'public', contentType: 'image/png' }),
  EXTERNAL_CALL_TIMEOUT_MS,
  'Uploading your logo'
);

const bucketHatBlob = await withTimeout(
  put(`logos/${sessionId}-bucket-${timestamp}.png`, bucketHatLogoBuffer, { access: 'public', contentType: 'image/png' }),
  EXTERNAL_CALL_TIMEOUT_MS,
  'Uploading your bucket-hat logo'
);

logoUrl = blob.url;
bucketHatLogoUrl = bucketHatBlob.url;
  } catch (err) {
    console.error('Logo upload failed:', err);
    return res.status(502).json({ code: 'UPLOAD_FAILED', message: 'Could not process your logo.', debug: String((err && err.message) || err) });
  }

  let designs;
  try {
    designs = await generateAllDesigns({ logoUrl, bucketHatLogoUrl, logoBuffer, primaryColor, secondaryColor, capDesigns, sessionId, put, getMockup, render, findSmartObjectByName, findOptionalSmartObjectByName, buildBandImage, buildCapArtwork, PRODUCTS, PRODUCT_VARIATIONS });
  } catch (err) {
    console.error('Mock-up generation failed:', err);
    return res.status(502).json({ code: 'GENERATION_FAILED', message: 'Could not generate mock-ups right now.', debug: String((err && err.message) || err) });
  }

  if (tier === '1') usage.tier1Used = true;
  if (tier === '2') {
    usage.tier2Used = true;
    usage.email = email;
  }
  usage.designs = (usage.designs || []).concat(designs);
  try {
    await withTimeout(kv.set(usageKey, usage, { ex: 60 * 60 * 24 * 30 }), EXTERNAL_CALL_TIMEOUT_MS, 'Saving session storage');
  } catch (err) {
    console.error('KV write failed (non-fatal):', err);
  }

  return res.status(200).json({
    images: designs.map((d) => d.url),
    productTypes: designs.map((d) => d.productType),
    message: tier === '1'
      ? `Here are your ${designs.length} custom headwear concepts.`
      : "Here's your next set — thanks, we'll be in touch.",
  });
}

function readJsonBody(req) {
  // Vercel's Node.js runtime sometimes automatically parses JSON request
  // bodies into req.body before our handler ever runs, which would leave
  // the raw stream already drained by the time we try to read it manually
  // below — silently producing an empty result with no error. Checking
  // for this first covers that case; the manual stream read remains as a
  // fallback for when it's not already parsed.
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function generateAllDesigns({ logoUrl, bucketHatLogoUrl, logoBuffer, primaryColor, secondaryColor, capDesigns, sessionId, put, getMockup, render, findSmartObjectByName, findOptionalSmartObjectByName, buildBandImage, buildCapArtwork, PRODUCTS, PRODUCT_VARIATIONS }) {
  const designs = [];
  const enabledProducts = new Set(
    String(process.env.ENABLED_PRODUCTS || 'cap')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  for (const [productKey, config] of Object.entries(PRODUCTS)) {
    if (!enabledProducts.has(productKey)) continue;

    const mockupUuid = process.env[config.mockupUuidEnvVar] || config.mockupUuid;
    if (!mockupUuid) {
      throw new Error(`Missing env var ${config.mockupUuidEnvVar} — upload the ${productKey} PSD to SudoMock and set its mockup UUID.`);
    }

    const mockupData = await withTimeout(getMockup(mockupUuid), EXTERNAL_CALL_TIMEOUT_MS, `Fetching ${productKey} mockup data`);
    const variationKeys = productKey === 'cap'
      ? capDesigns.map((_, index) => `design${index + 1}`)
      : (config.variationCount === 2 ? PRODUCT_VARIATIONS.slice(0, 2) : PRODUCT_VARIATIONS);

    for (const [variationIndex, variationKey] of variationKeys.entries()) {
      if (config.artworkDriven && productKey === 'cap') {
        const capDesign = capDesigns[variationIndex];
        const layers = {
          front: findSmartObjectByName(mockupData, 'FRONT DESIGN'),
          side: findSmartObjectByName(mockupData, 'SIDE DESIGN'),
          peak: findSmartObjectByName(mockupData, 'PEAK DESIGN'),
        };
        const eyelet = findOptionalSmartObjectByName(mockupData, 'EYELET');
        const topButton = findOptionalSmartObjectByName(mockupData, 'TOP BUTTON');
        if (eyelet) layers.eyelet = eyelet;
        if (topButton) layers.topButton = topButton;
        const artwork = await buildCapArtwork({
          logoBuffer,
          frontColor: capDesign.frontColor,
          sideColor: capDesign.sideColor,
          peakColor: capDesign.peakColor,
          nogginLogoColor: capDesign.nogginLogoColor,
          layers,
        });
        const smartObjects = [];

        for (const [area, layer] of Object.entries(layers)) {
          // Preserve the original transparent pixels/masks on the eyelets and
          // top button. Replacing either with a solid image would fill the
          // complete Smart Object rectangle instead of just the visible part.
          if (area === 'eyelet') {
            smartObjects.push({ uuid: layer.uuid, color: { hex: capDesign.eyeletColor } });
            continue;
          }
          if (area === 'topButton') {
            smartObjects.push({ uuid: layer.uuid, color: { hex: capDesign.topButtonColor } });
            continue;
          }

          const blob = await withTimeout(
            put(
              `cap-artwork/${sessionId}-${variationKey}-${area}-${Date.now()}.png`,
              artwork[area],
              { access: 'public', contentType: 'image/png' }
            ),
            EXTERNAL_CALL_TIMEOUT_MS,
            `Uploading cap ${area} artwork`
          );
          smartObjects.push({ uuid: layer.uuid, asset: { url: blob.url, fit: 'fill' } });
        }

        const renderedUrl = await withTimeout(
          render(mockupUuid, smartObjects),
          EXTERNAL_CALL_TIMEOUT_MS,
          `Rendering ${productKey} ${variationKey}`
        );
        designs.push({ url: renderedUrl, productType: productKey, variation: variationKey });
        continue;
      }

      const zoneAssignment = config.colourZones[variationKey];
      const smartObjects = [];

      for (const [layerName, whichColour] of Object.entries(zoneAssignment)) {
        if (layerName === 'TOP LABEL BAND') continue;
        const layerUuid = config.layerUuids && config.layerUuids[layerName];
        const so = layerUuid ? { uuid: layerUuid } : findSmartObjectByName(mockupData, layerName);
        const hex = whichColour === 'primary' ? primaryColor : whichColour === 'secondary' ? secondaryColor : whichColour;
        smartObjects.push({ uuid: so.uuid, color: { hex } });
      }

      if (config.hasCompositeBand) {
        const bandLayer = findSmartObjectByName(mockupData, 'TOP LABEL');
        const bandColourKey = zoneAssignment['TOP LABEL BAND'];
        const bandHex = bandColourKey === 'primary' ? primaryColor : secondaryColor;
        const bandImageBuffer = await buildBandImage(bandHex, bandLayer.size.width, bandLayer.size.height);
        const bandBlob = await withTimeout(
          put(`bands/${sessionId}-${productKey}-${variationKey}-${Date.now()}.png`, bandImageBuffer, { access: 'public', contentType: 'image/png' }),
          EXTERNAL_CALL_TIMEOUT_MS,
          'Uploading generated band image'
        );
        smartObjects.push({ uuid: bandLayer.uuid, asset: { url: bandBlob.url, fit: 'fill' } });
      }

      const logoUuid = config.layerUuids && config.layerUuids[config.logoLayerName];
      const logoLayer = logoUuid ? { uuid: logoUuid } : findSmartObjectByName(mockupData, config.logoLayerName);
     smartObjects.push({
  uuid: logoLayer.uuid,
  asset: {
    url: productKey === 'bucketHat' ? bucketHatLogoUrl : logoUrl,
    fit: 'fit',
  },
});

      const renderedUrl = await withTimeout(render(mockupUuid, smartObjects), EXTERNAL_CALL_TIMEOUT_MS, `Rendering ${productKey} ${variationKey}`);
      designs.push({ url: renderedUrl, productType: productKey, variation: variationKey });
    }
  }

  return designs;
}
