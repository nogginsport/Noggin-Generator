// Shared readable-colour rules. Keep team colours when contrast allows it.
function rgb(hex) {
  const s = String(hex).replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(s)) throw new Error('Expected a six-digit hex colour.');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
}
function luminance(hex) {
  const c = rgb(hex).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function readableColour(background, preferred, alternate) {
  for (const c of [preferred, alternate]) if (c && contrast(background, c) >= 3) return c;
  return contrast(background, '#FFFFFF') >= contrast(background, '#141414') ? '#FFFFFF' : '#141414';
}
function brandColour(background, preferred, primary) {
  // Only correct white lettering on white fabric; keep other designs as supplied.
  if (preferred && rgb(background).every(v => v >= 238) && rgb(preferred).every(v => v >= 238)) {
    return readableColour(background, primary);
  }
  return preferred || '#FFFFFF';
}
function rgba(hex) { const [r, g, b] = rgb(hex); return ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0; }
function recolour(image, hex) {
  const [r, g, b] = rgb(hex), d = image.bitmap.data;
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  return image;
}
function adaptLogo(image, background) {
  const result = image.clone(), d = result.bitmap.data;
  let count = 0;
  const min = [255, 255, 255], max = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 96) continue;
    count++;
    for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], d[i + c]); max[c] = Math.max(max[c], d[i + c]); }
  }
  const monochrome = max.every((v, i) => v - min[i] <= 28);
  const blackOnBlack = count && max.every(v => v <= 60) && rgb(background).every(v => v <= 60);
  if (blackOnBlack && monochrome) recolour(result, '#FFFFFF');
  return { image: result, outline: null };
}
module.exports = { rgb, rgba, contrast, readableColour, brandColour, recolour, adaptLogo };
