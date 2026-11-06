// Renders every site icon size from public/favicon.svg (Sparky), so browsers, phones and link previews all show him.
// Usage: npm run site-icons   (needs Playwright with Chromium, e.g. `npx playwright install chromium`)
// Writes to public/: favicon.ico (16, 32, 48), apple-touch-icon.png (180), icon-192.png, icon-512.png,
// icon-maskable-512.png and og-image.png (1200x630 link preview card).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// require() so a global Playwright install (NODE_PATH) works too; it is not a project dependency.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const mark = readFileSync(join(pub, 'favicon.svg'), 'utf8');
const SKY = 'linear-gradient(#cfe7f2, #eaf4f8)';
// Inlined as data URLs because a page made with setContent cannot load file:// fonts.
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'node_modules/@fontsource-variable', pkg, 'files', file)).toString('base64')}`;

/** The bare mark, transparent around it. */
const bare = (size) => `<div style="width:${size}px;height:${size}px">${mark.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`;

/** The mark on a sky tile; `scale` is how much of the tile Sparky fills (maskable icons need room for the crop). */
const tile = (size, scale, radius = 0) => `<div style="width:${size}px;height:${size}px;background:${SKY};border-radius:${radius}px;
  display:grid;place-items:center"><div style="width:${size * scale}px;height:${size * scale}px">${mark.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`;

const og = `<style>
  @font-face { font-family: Fredoka; src: url(${font('fredoka', 'fredoka-latin-wght-normal.woff2')}); font-weight: 300 700; }
  @font-face { font-family: Lexend; src: url(${font('lexend', 'lexend-latin-wght-normal.woff2')}); font-weight: 100 900; }
</style>
<div style="position:relative;width:1200px;height:630px;overflow:hidden;background:${SKY};display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box">
  <svg viewBox="0 0 1200 630" style="position:absolute;inset:0" aria-hidden="true">
    <ellipse cx="260" cy="700" rx="560" ry="170" fill="#d9ecc6"/>
    <ellipse cx="1000" cy="720" rx="620" ry="190" fill="#c6e0ae"/>
  </svg>
  <div style="position:relative;width:400px;height:400px;flex:none">${mark.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  <div style="position:relative;color:#263043">
    <div style="font-family:Fredoka;font-weight:600;font-size:118px;line-height:1">Spark</div>
    <div style="font-family:Fredoka;font-weight:500;font-size:54px;line-height:1.1;color:#c8644a;margin-top:8px">Cloud Builders</div>
    <div style="font-family:Lexend;font-size:28px;line-height:1.4;color:#3d4659;margin-top:22px;max-width:560px">A visual game that teaches how AWS cloud services connect.</div>
  </div>
</div>`;

/** Minimal .ico holding PNG images (supported by every browser since IE Vista era). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(html, width, height, transparent) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body style="margin:0;background:transparent">${html}</body>`);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
}

const favicons = [];
for (const size of [16, 32, 48]) favicons.push({ size, data: await shot(bare(size), size, size, true) });
writeFileSync(join(pub, 'favicon.ico'), ico(favicons));
// iOS fills transparency with black and rounds the corners itself, so the tile is square and opaque.
writeFileSync(join(pub, 'apple-touch-icon.png'), await shot(tile(180, 0.84), 180, 180, false));
for (const size of [192, 512]) writeFileSync(join(pub, `icon-${size}.png`), await shot(tile(size, 0.82, size * 0.22), size, size, true));
// Maskable: launchers may crop to a circle that keeps only the middle 80%, so Sparky sits inside that.
writeFileSync(join(pub, 'icon-maskable-512.png'), await shot(tile(512, 0.62), 512, 512, false));
writeFileSync(join(pub, 'og-image.png'), await shot(og, 1200, 630, false));
await browser.close();
console.log('Site icons written to public/');
