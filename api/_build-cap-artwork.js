const { Jimp, JimpMime } = require('jimp');
const path = require('path');

const SIDE_LOGO_PATH = path.join(__dirname, '..', 'assets', 'noggin-sport-side-logo.png');

// Coordinates measured directly from the original SIDE DESIGN smart object
// (1712 x 1989). Keeping these fixed preserves Noggin's supplied branding.
const SIDE_REFERENCE = {
  width: 1712,
  height: 1989,
  logoX: 285,
  logoY: 1633,
  logoWidth: 456,
  logoHeight: 177,
};

async function buildCapArtwork({ logoBuffer, frontColor, sideColor, peakColor, nogginLogoColor, layers }) {
  const preparedLogo = await prepareCustomerLogo(logoBuffer);

  const artwork = {
    front: await buildFrontPanel(preparedLogo, frontColor, layers.front.size.width, layers.front.size.height),
    side: await buildSidePanel(sideColor, nogginLogoColor, layers.side.size.width, layers.side.size.height),
    peak: await buildSolidPanel(peakColor, layers.peak.size.width, layers.peak.size.height),
  };

  return artwork;
}

async function buildFrontPanel(preparedLogo, colour, width, height) {
  const canvas = new Jimp({ width, height, color: hexToJimpInt(colour) });

  // The approved visual calibration: crest occupies at most 35% of the
  // smart-object height/width and sits 11% below mathematical centre.
  const maxWidth = Math.round(width * 0.35);
  const maxHeight = Math.round(height * 0.35);
  const scale = Math.min(maxWidth / preparedLogo.width, maxHeight / preparedLogo.height);
  const logoWidth = Math.max(1, Math.round(preparedLogo.width * scale));
  const logo = preparedLogo.clone().resize({ w: logoWidth });
  const x = Math.round((width - logo.width) / 2);
  const y = Math.round((height - logo.height) / 2 + height * 0.11);

  canvas.composite(logo, x, y);
  return canvas.getBuffer(JimpMime.png);
}

async function buildSidePanel(colour, logoColour, width, height) {
  const canvas = new Jimp({ width, height, color: hexToJimpInt(colour) });
  const sideLogo = await Jimp.read(SIDE_LOGO_PATH);
  recolourVisiblePixels(sideLogo, logoColour);

  const scaleX = width / SIDE_REFERENCE.width;
  const scaleY = height / SIDE_REFERENCE.height;
  const logoWidth = Math.round(SIDE_REFERENCE.logoWidth * scaleX);
  sideLogo.resize({ w: logoWidth });

  canvas.composite(
    sideLogo,
    Math.round(SIDE_REFERENCE.logoX * scaleX),
    Math.round(SIDE_REFERENCE.logoY * scaleY)
  );
  return canvas.getBuffer(JimpMime.png);
}

function recolourVisiblePixels(image, hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const { data } = image.bitmap;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
  }
}

async function buildSolidPanel(colour, width, height) {
  const canvas = new Jimp({ width, height, color: hexToJimpInt(colour) });
  return canvas.getBuffer(JimpMime.png);
}

async function prepareCustomerLogoBuffer(buffer, paddingRatio = 0, targetAspectRatio = null) {
  const preparedLogo = await prepareCustomerLogo(buffer);

  if (paddingRatio <= 0 && !targetAspectRatio) {
    return preparedLogo.getBuffer(JimpMime.png);
  }

  let canvasWidth = preparedLogo.width * (1 + (paddingRatio * 2));
  let canvasHeight = preparedLogo.height * (1 + (paddingRatio * 2));

  if (targetAspectRatio) {
    if ((canvasWidth / canvasHeight) < targetAspectRatio) {
      canvasWidth = canvasHeight * targetAspectRatio;
    } else {
      canvasHeight = canvasWidth / targetAspectRatio;
    }
  }

  canvasWidth = Math.round(canvasWidth);
  canvasHeight = Math.round(canvasHeight);

  const canvas = new Jimp({
    width: canvasWidth,
    height: canvasHeight,
    color: 0x00000000,
  });

  const x = Math.round((canvasWidth - preparedLogo.width) / 2);
  const y = Math.round((canvasHeight - preparedLogo.height) / 2);

  canvas.composite(preparedLogo, x, y);
  return canvas.getBuffer(JimpMime.png);
}
  

async function prepareCustomerLogo(buffer) {
  const img = await Jimp.read(buffer);

  // Keep processing memory predictable in the serverless function.
  const longestEdge = Math.max(img.width, img.height);
  if (longestEdge > 2048) {
    if (img.width >= img.height) img.resize({ w: 2048 });
    else img.resize({ h: 2048 });
  }

  removeEdgeConnectedBackground(img);
  const bounds = visibleBounds(img);
  if (!bounds) throw new Error('The uploaded logo contains no visible pixels after background removal.');

  return img.crop(bounds);
}

function removeEdgeConnectedBackground(img) {
  const { width, height, data } = img.bitmap;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  // Most customer JPGs arrive on a flat white or coloured rectangle. Find
  // the dominant colour around the outside edge and only treat it as a
  // removable background when it occupies a meaningful share of that edge.
  // Transparent PNGs simply pass through unchanged.
  const background = dominantBorderColour(img);
  const useColourBackground = background && background.share >= 0.35;

  function enqueue(index) {
    if (index < 0 || index >= pixelCount || visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    if (!isBackgroundPixel(data, offset, background, useColourBackground)) return;
    queue[tail++] = index;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    data[index * 4 + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
}

function isBackgroundPixel(data, offset, background, useColourBackground) {
  const alpha = data[offset + 3];
  if (alpha === 0) return true;
  if (data[offset] >= 238 && data[offset + 1] >= 238 && data[offset + 2] >= 238) return true;
  if (!useColourBackground) return false;
  return colourDistance(
    data[offset], data[offset + 1], data[offset + 2],
    background.r, background.g, background.b
  ) <= 34;
}

function dominantBorderColour(img) {
  const { width, height, data } = img.bitmap;
  const bins = new Map();
  let opaqueCount = 0;

  function sample(x, y) {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] < 96) return;
    opaqueCount += 1;
    const r = Math.round(data[offset] / 24) * 24;
    const g = Math.round(data[offset + 1] / 24) * 24;
    const b = Math.round(data[offset + 2] / 24) * 24;
    const key = `${r},${g},${b}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }

  for (let x = 0; x < width; x += 1) {
    sample(x, 0);
    if (height > 1) sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    sample(0, y);
    if (width > 1) sample(width - 1, y);
  }

  if (!opaqueCount || !bins.size) return null;
  const [key, count] = [...bins.entries()].sort((a, b) => b[1] - a[1])[0];
  const [r, g, b] = key.split(',').map(Number);
  return { r: Math.min(r, 255), g: Math.min(g, 255), b: Math.min(b, 255), share: count / opaqueCount };
}

function colourDistance(r1, g1, b1, r2, g2, b2) {
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function visibleBounds(img) {
  const { width, height, data } = img.bitmap;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function hexToJimpInt(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

module.exports = {
  buildCapArtwork,
  prepareCustomerLogo,
  prepareCustomerLogoBuffer,
  SIDE_REFERENCE,
};
