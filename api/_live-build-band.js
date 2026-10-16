const { Jimp, JimpMime } = require('jimp');
const path = require('path');
const { rgba, recolour, brandColour } = require('./_live-logo-contrast');
const WORDMARK_PATH = path.join(__dirname, '..', 'assets', 'noggin-wordmark.png');
async function buildBandImage(hexColour, width, height, primaryColour = null) {
  const clean = hexColour.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16));
  // Preserve the original band contrast rule. Only white bands gain team-colour details.
  const usualDetail = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#141414' : '#FFFFFF';
  const detail = primaryColour && [r, g, b].every(v => v >= 238)
    ? brandColour(hexColour, '#FFFFFF', primaryColour) : usualDetail;
  const canvas = new Jimp({ width, height, color: rgba(hexColour) });
  const lineHeight = Math.max(2, Math.round(height * 0.02));
  const inset = Math.round(height * 0.12);
  const line = new Jimp({ width, height: lineHeight, color: rgba(detail) });
  canvas.composite(line, 0, inset);
  canvas.composite(line, 0, height - inset - lineHeight);
  const wordmark = recolour(await Jimp.read(WORDMARK_PATH), detail);
  wordmark.resize({ w: Math.max(1, Math.round(width * 0.55)) });
  canvas.composite(wordmark, Math.round((width - wordmark.width) / 2), Math.round((height - wordmark.height) / 2));
  return canvas.getBuffer(JimpMime.png);
}
module.exports = { buildBandImage };
