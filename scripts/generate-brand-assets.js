#!/usr/bin/env node

/**
 * Brand asset generator for CogniMesh.
 * Produces brand-meta.json from the canonical proposallogo2 logo.
 * The SVG camel assets are legacy — the primary logo is the PNG.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const brandDir = path.join(projectRoot, 'docs', 'assets', 'brand');

const layers = [
  'BIOS Orchestration',
  'Subscription Runtime',
  'Domain State',
  'Execution Bus',
  'Operator Surfaces',
  'Release Plane'
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`wrote ${path.relative(projectRoot, filePath)}`);
}

function main() {
  ensureDir(brandDir);

  const metaPath = path.join(brandDir, 'brand-meta.json');
  const meta = {
    name: 'CogniMesh',
    tagline: 'Multi-model AI orchestration, subscription-first',
    logo: 'proposallogo2-transparent.png',
    layers,
    providers: ['Anthropic', 'OpenAI', 'Moonshot'],
    modelCount: 7,
    billingModel: 'subscription-only'
  };

  writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

main();
