const { Jimp, JimpMime } = require('jimp');
const path = require('path');
const { rgba, recolour, brandColour, adaptLogo } = require('./_live-logo-contrast');
const SIDE_LOGO_PATH = path.join(__dirname, '..', 'assets', 'noggin-sport-side-logo.png');
const SIDE_REFERENCE = { width: 1712, height: 1989, logoX: 285, logoY: 1633, logoWidth: 456, logoHeight: 177 };

async function buildCapArtwork({ logoBuffer, frontColor, sideColor, peakColor, nogginLogoColor, layers }) {
  const prepared = await prepareCustomerLogo(logoBuffer);
  return {
    front: await buildFrontPanel(prepared, frontColor, layers.front.size.width, layers.front.size.height),
    side: await buildSidePanel(sideColor, nogginLogoColor, layers.side.size.width, layers.side.size.height),
    peak: await new Jimp({ width: layers.peak.size.width, height: layers.peak.size.height, color: rgba(peakColor) }).getBuffer(JimpMime.png),
  };
}
// Draw at a fixed size AFTER trimming upload padding. Keep original proportions.
function placeLogo(canvas, prepared, maxWidth, maxHeight, centreX, centreY, background) {
  const adapted = background ? adaptLogo(prepared, background) : { image: prepared.clone(), outline: null };
  const scale = Math.min(maxWidth / prepared.width, maxHeight / prepared.height);
  const logo = adapted.image.resize({ w: Math.max(1, Math.round(prepared.width * scale)), h: Math.max(1, Math.round(prepared.height * scale)) });
  const x = Math.round(centreX - logo.width / 2), y = Math.round(centreY - logo.height / 2);
  canvas.composite(logo, x, y);
}
async function buildFrontPanel(prepared, colour, width, height) {
  const canvas = new Jimp({ width, height, color: rgba(colour) });
  placeLogo(canvas, prepared, Math.round(width * 0.35), Math.round(height * 0.35), width / 2, height * 0.61, colour);
  return canvas.getBuffer(JimpMime.png);
}
async function buildSidePanel(colour, logoColour, width, height) {
  const canvas = new Jimp({ width, height, color: rgba(colour) });
  const logo = await Jimp.read(SIDE_LOGO_PATH);
  recolour(logo, brandColour(colour, logoColour, logoColour));
  logo.resize({ w: Math.max(1, Math.round(SIDE_REFERENCE.logoWidth * width / SIDE_REFERENCE.width)) });
  canvas.composite(logo, Math.round(SIDE_REFERENCE.logoX * width / SIDE_REFERENCE.width), Math.round(SIDE_REFERENCE.logoY * height / SIDE_REFERENCE.height));
  return canvas.getBuffer(JimpMime.png);
}
// Existing 3-argument calls remain supported. A fourth argument supplies fabric colour.
async function prepareCustomerLogoBuffer(buffer, paddingRatio = 0, targetAspectRatio = null, background = null) {
  const prepared = await prepareCustomerLogo(buffer);
  let w = prepared.width * (1 + 2 * paddingRatio), h = prepared.height * (1 + 2 * paddingRatio);
  if (targetAspectRatio) { if (w / h < targetAspectRatio) w = h * targetAspectRatio; else h = w / targetAspectRatio; }
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const canvas = new Jimp({ width: w, height: h, color: 0x00000000 });
  placeLogo(canvas, prepared, prepared.width, prepared.height, w / 2, h / 2, background);
  return canvas.getBuffer(JimpMime.png);
}
async function prepareCustomerLogo(buffer) {
  const img = await Jimp.read(buffer);
  if (Math.max(img.width, img.height) > 2048) img.resize(img.width >= img.height ? { w: 2048 } : { h: 2048 });
  removeEdgeConnectedBackground(img);
  const bounds = visibleBounds(img);
  if (!bounds) throw new Error('The uploaded logo contains no visible artwork.');
  return img.crop(bounds);
}
function removeEdgeConnectedBackground(img) {
  const { width, height, data } = img.bitmap;
  // Transparent files already describe their own silhouette. Never flood through
  // transparency into white letters, black outlines, or other actual artwork.
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return;
  const border = [];
  for (let x = 0; x < width; x++) { border.push(x, (height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { border.push(y * width, y * width + width - 1); }
  const colour = [data[0], data[1], data[2]];
  const matches = index => { const i = index * 4; return Math.hypot(data[i] - colour[0], data[i + 1] - colour[1], data[i + 2] - colour[2]) <= 34; };
  // Only remove a convincingly flat, edge-connected background. Ambiguous
  // full-bleed uploads are preserved instead of losing parts of the crest.
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  if (!corners.every(matches) || border.filter(matches).length / border.length < 0.9) return;
  const original = Buffer.from(data);
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  function add(index) { if (seen[index]) return; seen[index] = 1; if (matches(index)) queue[tail++] = index; }
  border.forEach(add);
  while (head < tail) {
    const index = queue[head++], x = index % width, y = Math.floor(index / width);
    data[index * 4 + 3] = 0;
    if (x) add(index - 1); if (x + 1 < width) add(index + 1);
    if (y) add(index - width); if (y + 1 < height) add(index + width);
  }
  // A flat opaque image may itself be a mark; don't turn it into an empty file.
  if (!visibleBounds(img)) original.copy(data);
}
function visibleBounds(img) {
  const { width, height, data } = img.bitmap;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
module.exports = { buildCapArtwork, prepareCustomerLogo, prepareCustomerLogoBuffer, SIDE_REFERENCE };
