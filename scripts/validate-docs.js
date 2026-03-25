#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const errors = [];
const checked = [];

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function ensureExists(relativePath, source, rawRef) {
  const targetPath = path.resolve(path.dirname(path.join(repoRoot, source)), relativePath);
  if (!fs.existsSync(targetPath)) {
    errors.push(`${source} references missing path: ${rawRef}`);
    return;
  }

  checked.push(path.relative(repoRoot, targetPath));
}

function isLocalReference(reference) {
  if (!reference) {
    return false;
  }

  return !reference.startsWith('#') &&
    !reference.startsWith('http://') &&
    !reference.startsWith('https://') &&
    !reference.startsWith('mailto:') &&
    !reference.startsWith('javascript:');
}

function validateMarkdownLinks(source, content) {
  const markdownRefPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of content.matchAll(markdownRefPattern)) {
    const reference = match[1];
    if (isLocalReference(reference)) {
      ensureExists(reference, source, reference);
    }
  }

  const htmlRefPattern = /\b(?:src|href)=["']([^"']+)["']/g;
  for (const match of content.matchAll(htmlRefPattern)) {
    const reference = match[1];
    if (isLocalReference(reference)) {
      ensureExists(reference, source, reference);
    }
  }
}

function validateHtmlLinks(source, content) {
  const htmlRefPattern = /\b(?:src|href)=["']([^"']+)["']/g;
  for (const match of content.matchAll(htmlRefPattern)) {
    const reference = match[1];
    if (isLocalReference(reference)) {
      ensureExists(reference, source, reference);
    }
  }
}

const filesToValidate = [
  ['README.md', 'markdown'],
  ['docs/index.html', 'html'],
  ['src/clients/README.md', 'markdown'],
  ['src/clients/CONTRACT.md', 'markdown'],
  ['src/clients/claude/IDE_INTEGRATION.md', 'markdown'],
  ['docs/kimi-vscode-integration.md', 'markdown']
];

for (const [source, kind] of filesToValidate) {
  const content = readFile(source);
  if (kind === 'html') {
    validateHtmlLinks(source, content);
  } else {
    validateMarkdownLinks(source, content);
  }
}

const readme = readFile('README.md');
const docsIndex = readFile('docs/index.html');
const clientsReadme = readFile('src/clients/README.md');
const clientsContract = readFile('src/clients/CONTRACT.md');
const claudeVscodeDoc = readFile('src/clients/claude/IDE_INTEGRATION.md');
const kimiVscodeDoc = readFile('docs/kimi-vscode-integration.md');
if (/Compatibility aliases/i.test(readme)) {
  errors.push('README.md still mentions compatibility aliases');
}

if (/API-backed workflows/i.test(readme)) {
  errors.push('README.md still advertises API-backed workflows on the canonical path');
}

if (/camel-banner\.svg/i.test(readme)) {
  errors.push('README.md should use the clean logo, not the banner asset');
}

if (/camel-banner\.svg/i.test(docsIndex)) {
  errors.push('docs/index.html should use the clean logo-first layout, not the banner asset');
}

const staleSurfaceChecks = [
  ['src/clients/README.md', clientsReadme, [/ClaudeIdeClient/, /KimiIdeClient/, /ClaudeMcpClient/, /KimiSwarmClient/, /CodexCopilotClient/, /CodexCursorClient/, /\bide\.js\b/i, /\bmcp\.js\b/i, /\bswarm\.js\b/i, /\bcopilot\.js\b/i, /\bcursor\.js\b/i]],
  ['src/clients/CONTRACT.md', clientsContract, [/ClaudeIdeClient/, /KimiIdeClient/, /ClaudeMcpClient/, /KimiSwarmClient/, /CodexCopilotClient/, /CodexCursorClient/, /\bgeneric `ide`\b/i]],
  ['src/clients/claude/IDE_INTEGRATION.md', claudeVscodeDoc, [/ClaudeIdeClient/, /claude\/ide\.js/i]],
  ['docs/kimi-vscode-integration.md', kimiVscodeDoc, [/KimiIdeClient/, /kimi\/ide\.js/i]]
];

for (const [source, content, patterns] of staleSurfaceChecks) {
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      errors.push(`${source} contains stale surface reference: ${pattern}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Docs validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Docs validation passed (${checked.length} local references checked).`);
