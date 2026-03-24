#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const brandDir = path.join(projectRoot, 'docs', 'assets', 'brand');

const humpLabels = [
  'AMS BIOS',
  'Provider Surfaces',
  'Domain Data',
  'Execution Bus',
  'Operator UX',
  'Release Control'
];

const palette = {
  ink: '#251815',
  copper: '#c86c2a',
  sand: '#f3e1c9',
  clay: '#91502d',
  teal: '#0f5c61',
  mist: '#fff8ef',
  ember: '#f0b353'
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function camelBackPath(humpCount, { startX, baseY, humpWidth, peakY }) {
  let pathValue = `M ${startX} ${baseY}`;

  for (let index = 0; index < humpCount; index += 1) {
    const humpStart = startX + index * humpWidth;
    const humpPeak = humpStart + humpWidth / 2;
    const humpEnd = humpStart + humpWidth;

    pathValue += ` C ${humpStart + humpWidth * 0.18} ${peakY + 46} ${humpPeak - humpWidth * 0.14} ${peakY} ${humpPeak} ${peakY}`;
    pathValue += ` C ${humpPeak + humpWidth * 0.14} ${peakY} ${humpEnd - humpWidth * 0.18} ${peakY + 46} ${humpEnd} ${baseY}`;
  }

  return pathValue;
}

function camelBodyPath(humpCount) {
  const startX = 128;
  const baseY = 292;
  const humpWidth = 78;
  const peakY = 214;
  const backPath = camelBackPath(humpCount, { startX, baseY, humpWidth, peakY });
  const bodyEndX = startX + humpCount * humpWidth;

  return [
    `${backPath}`,
    `C ${bodyEndX + 28} 286 ${bodyEndX + 56} 266 ${bodyEndX + 74} 234`,
    `C ${bodyEndX + 92} 200 ${bodyEndX + 116} 164 ${bodyEndX + 156} 152`,
    `C ${bodyEndX + 188} 144 ${bodyEndX + 220} 154 ${bodyEndX + 232} 182`,
    `C ${bodyEndX + 242} 206 ${bodyEndX + 236} 236 ${bodyEndX + 208} 248`,
    `C ${bodyEndX + 172} 264 ${bodyEndX + 138} 252 ${bodyEndX + 120} 266`,
    `C ${bodyEndX + 94} 286 ${bodyEndX + 86} 326 ${bodyEndX + 82} 360`,
    `L ${bodyEndX + 64} 520`,
    `C ${bodyEndX + 62} 534 ${bodyEndX + 48} 544 ${bodyEndX + 34} 544`,
    `L ${bodyEndX + 4} 544`,
    `C ${bodyEndX - 10} 544 ${bodyEndX - 20} 532 ${bodyEndX - 18} 518`,
    `L ${bodyEndX - 2} 392`,
    `L 568 392`,
    `L 548 540`,
    `C 546 554 532 564 518 564`,
    `L 494 564`,
    `C 478 564 468 550 470 536`,
    `L 490 392`,
    `L 376 392`,
    `L 356 550`,
    `C 354 564 340 574 326 574`,
    `L 300 574`,
    `C 284 574 274 560 276 546`,
    `L 296 392`,
    `L 206 392`,
    `L 188 524`,
    `C 186 538 172 548 158 548`,
    `L 130 548`,
    `C 114 548 104 534 106 520`,
    `L 124 360`,
    `C 126 338 120 316 112 300`,
    'Z'
  ].join(' ');
}

function buildLogoSvg(humpCount) {
  const bodyPath = camelBodyPath(humpCount);

  const humpNodes = humpLabels.map((label, index) => {
    const x = 168 + index * 78 + 39;
    const y = 208;
    return `
      <circle cx="${x}" cy="${y}" r="8" fill="${palette.ember}" stroke="${palette.ink}" stroke-width="4" />
      <circle cx="${x}" cy="${y}" r="3" fill="${palette.ink}" />
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="720" viewBox="0 0 960 720" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="camelFill" x1="120" y1="180" x2="860" y2="560" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${palette.sand}" />
      <stop offset="58%" stop-color="#F7D7A8" />
      <stop offset="100%" stop-color="#E3A86F" />
    </linearGradient>
    <linearGradient id="camelShade" x1="220" y1="250" x2="760" y2="560" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${palette.copper}" stop-opacity="0.85" />
      <stop offset="100%" stop-color="${palette.clay}" stop-opacity="0.92" />
    </linearGradient>
    <filter id="softShadow" x="62" y="130" width="840" height="480" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#7A4A2A" flood-opacity="0.18" />
    </filter>
  </defs>

  <g filter="url(#softShadow)">
    <path d="${bodyPath}" fill="url(#camelFill)" stroke="${palette.ink}" stroke-width="18" stroke-linejoin="round" />
    <path d="M 146 350 C 198 316 258 324 316 334 C 376 344 442 344 512 328 C 578 314 652 320 734 350" stroke="url(#camelShade)" stroke-width="18" stroke-linecap="round" opacity="0.82" />
    <path d="M 704 206 C 726 196 750 198 766 214" stroke="${palette.ink}" stroke-width="12" stroke-linecap="round" />
    <circle cx="828" cy="194" r="7" fill="${palette.ink}" />
    ${humpNodes}
  </g>
</svg>`;
}

function buildBannerSvg(humpCount) {
  const logoSvg = buildLogoSvg(humpCount)
    .replace('<?xml version="1.0" encoding="UTF-8"?>', '')
    .replace('<svg width="960" height="720" viewBox="0 0 960 720" fill="none" xmlns="http://www.w3.org/2000/svg">', '<svg viewBox="0 0 960 720" fill="none" xmlns="http://www.w3.org/2000/svg">');

  const chips = humpLabels.map((label, index) => {
    const chipX = 650 + (index % 2) * 176;
    const chipY = 166 + Math.floor(index / 2) * 86;
    return `
      <g transform="translate(${chipX} ${chipY})">
        <rect width="154" height="42" rx="21" fill="rgba(255,248,239,0.82)" stroke="rgba(37,24,21,0.14)" />
        <text x="77" y="27" text-anchor="middle" fill="${palette.ink}" font-family="'IBM Plex Sans', 'Segoe UI', sans-serif" font-size="16" font-weight="600">${label}</text>
      </g>
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="heroBg" x1="0" y1="0" x2="1600" y2="900" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFF7E7" />
      <stop offset="55%" stop-color="#F4D7A8" />
      <stop offset="100%" stop-color="#D7844A" />
    </linearGradient>
    <radialGradient id="meshGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1210 176) rotate(90) scale(420 620)">
      <stop offset="0%" stop-color="white" stop-opacity="0.82" />
      <stop offset="100%" stop-color="white" stop-opacity="0" />
    </radialGradient>
    <pattern id="meshPattern" width="72" height="72" patternUnits="userSpaceOnUse">
      <circle cx="8" cy="8" r="2.3" fill="rgba(15,92,97,0.28)" />
      <circle cx="64" cy="38" r="1.8" fill="rgba(200,108,42,0.24)" />
      <path d="M8 8L64 38" stroke="rgba(15,92,97,0.1)" stroke-width="1.4" />
    </pattern>
  </defs>

  <rect width="1600" height="900" fill="url(#heroBg)" />
  <rect width="1600" height="900" fill="url(#meshPattern)" opacity="0.82" />
  <ellipse cx="1200" cy="176" rx="540" ry="360" fill="url(#meshGlow)" />
  <path d="M 0 680 C 280 620 498 734 768 670 C 1044 604 1324 760 1600 650 V 900 H 0 Z" fill="rgba(15,92,97,0.11)" />

  <g transform="translate(72 96) scale(0.66)">
    ${logoSvg}
  </g>

  <g transform="translate(664 132)">
    <text x="0" y="0" fill="${palette.ink}" font-family="'Space Grotesk', 'Segoe UI', sans-serif" font-size="114" font-weight="700">CKAMAL</text>
    <text x="0" y="68" fill="${palette.teal}" font-family="'IBM Plex Sans', 'Segoe UI', sans-serif" font-size="32" font-weight="600">Deep-integration camel agent for AMS, GitHub delivery, and subscription-backed model surfaces.</text>
    <text x="0" y="136" fill="rgba(37,24,21,0.74)" font-family="'IBM Plex Sans', 'Segoe UI', sans-serif" font-size="24">The camel carries ${humpCount} humps because the project stands on ${humpCount} stable abstractions, not on scattered features.</text>
  </g>

  ${chips}

  <g transform="translate(664 534)">
    <rect width="852" height="228" rx="32" fill="rgba(255,248,239,0.78)" stroke="rgba(37,24,21,0.14)" />
    <text x="42" y="58" fill="${palette.ink}" font-family="'Space Grotesk', 'Segoe UI', sans-serif" font-size="28" font-weight="700">Canonical subscription matrix</text>
    <text x="42" y="104" fill="rgba(37,24,21,0.74)" font-family="'IBM Plex Sans', 'Segoe UI', sans-serif" font-size="20">GPT-5.3/5.4 Codex, Claude Opus 4.6, Claude Sonnet 4.5/4.6, and Kimi K2.5 wired through CLI, desktop app, and VS Code surfaces.</text>
    <text x="42" y="156" fill="${palette.teal}" font-family="'IBM Plex Sans', 'Segoe UI', sans-serif" font-size="18" font-weight="600">Release gate: lint • unit • integration • e2e • provider-matrix • build smoke</text>
    <text x="42" y="196" fill="rgba(37,24,21,0.66)" font-family="'IBM Plex Sans', 'Segoe UI', sans-serif" font-size="18">GitHub face: README banner, Pages landing, Actions badges, release artifacts, transparent camel logo.</text>
  </g>
</svg>`;
}

function renderPng(svg, outputPath, width) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width
    }
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(outputPath, pngBuffer);
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`wrote ${path.relative(projectRoot, filePath)}`);
}

function main() {
  const humpCount = humpLabels.length;
  ensureDir(brandDir);

  const logoSvg = buildLogoSvg(humpCount);
  const bannerSvg = buildBannerSvg(humpCount);

  const logoSvgPath = path.join(brandDir, 'camel-logo.svg');
  const logoPngPath = path.join(brandDir, 'camel-logo.png');
  const bannerSvgPath = path.join(brandDir, 'camel-banner.svg');
  const bannerPngPath = path.join(brandDir, 'camel-banner.png');
  const metaPath = path.join(brandDir, 'brand-meta.json');

  writeFile(logoSvgPath, logoSvg);
  writeFile(bannerSvgPath, bannerSvg);
  renderPng(logoSvg, logoPngPath, 1200);
  renderPng(bannerSvg, bannerPngPath, 1600);
  writeFile(metaPath, `${JSON.stringify({ humpCount, humpLabels }, null, 2)}\n`);
}

main();
