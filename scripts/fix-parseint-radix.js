#!/usr/bin/env node
/**
 * Automated fix script for parseInt radix issues
 * 
 * This script finds all parseInt() calls without a radix parameter
 * and adds `, 10` to ensure consistent decimal parsing.
 * 
 * Usage:
 *   node scripts/fix-parseint-radix.js              # Apply fixes
 *   node scripts/fix-parseint-radix.js --dry-run    # Preview changes only
 *   node scripts/fix-parseint-radix.js --verbose    # Show detailed output
 */

import { readFileSync, writeFileSync, statSync } from 'fs';
import globModule from 'glob';
import { resolve, relative } from 'path';

const { sync: globSync } = globModule;

// Configuration
const CONFIG = {
  includePatterns: ['src/**/*.js', 'scripts/**/*.js'],
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/*.min.js'],
  radix: 10
};

// Statistics
const stats = {
  filesScanned: 0,
  filesModified: 0,
  totalFixes: 0,
  skipped: 0,
  errors: []
};

/**
 * Check if a parseInt call already has a radix parameter
 */
function hasRadix(content, matchIndex, fullMatch) {
  // Find the closing parenthesis of this parseInt call
  let parenCount = 0;
  let inString = null;
  let i = matchIndex + fullMatch.length;
  
  while (i < content.length) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : null;
    
    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = char;
    } else if (inString === char && prevChar !== '\\') {
      inString = null;
    }
    
    // Handle parentheses (only when not in string)
    if (!inString) {
      if (char === '(') {
        parenCount++;
      } else if (char === ')') {
        if (parenCount === 0) {
          // Found the closing paren
          break;
        }
        parenCount--;
      } else if (char === ',' && parenCount === 0) {
        // Found a comma at the top level - radix already exists
        return true;
      }
    }
    
    i++;
  }
  
  return false;
}

/**
 * Find the position to insert the radix (before the closing paren)
 */
function findInsertionPoint(content, matchIndex, fullMatch) {
  let parenCount = 0;
  let inString = null;
  let i = matchIndex + fullMatch.length;
  let lastNonWhitespace = i;
  
  while (i < content.length) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : null;
    
    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = char;
    } else if (inString === char && prevChar !== '\\') {
      inString = null;
    }
    
    // Handle parentheses (only when not in string)
    if (!inString) {
      if (char === '(') {
        parenCount++;
      } else if (char === ')') {
        if (parenCount === 0) {
          // Found the closing paren, return position before it
          return lastNonWhitespace;
        }
        parenCount--;
      }
    }
    
    // Track last non-whitespace character
    if (!/\s/.test(char)) {
      lastNonWhitespace = i + 1;
    }
    
    i++;
  }
  
  return -1;
}

/**
 * Check if parseInt is in a comment
 */
function isInComment(content, index) {
  // Check for line comment
  const lineStart = content.lastIndexOf('\n', index);
  const lineContent = content.substring(lineStart, index);
  if (lineContent.includes('//')) {
    return true;
  }
  
  // Check for block comment
  const before = content.substring(0, index);
  const blockOpen = before.lastIndexOf('/*');
  const blockClose = before.lastIndexOf('*/');
  if (blockOpen > blockClose) {
    return true;
  }
  
  return false;
}

/**
 * Check if parseInt is in a string literal
 */
function isInString(content, index) {
  let inString = null;
  let escaped = false;
  
  for (let i = 0; i < index; i++) {
    const char = content[i];
    
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      escaped = true;
      continue;
    }
    
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = char;
    } else if (inString === char) {
      inString = null;
    }
  }
  
  return inString !== null;
}

/**
 * Process a single file
 */
function processFile(filePath, options = {}) {
  const { dryRun = false, verbose = false } = options;
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    stats.filesScanned++;
    
    // Pattern to find parseInt calls
    const pattern = /parseInt\s*\(/g;
    let match;
    let fixes = [];
    
    // Find all parseInt calls
    while ((match = pattern.exec(content)) !== null) {
      const matchIndex = match.index;
      const fullMatch = match[0];
      
      // Skip if in comment
      if (isInComment(content, matchIndex)) {
        if (verbose) {
          console.log(`  Skipping comment at ${filePath}:${getLineNumber(content, matchIndex)}`);
        }
        continue;
      }
      
      // Skip if in string
      if (isInString(content, matchIndex)) {
        if (verbose) {
          console.log(`  Skipping string at ${filePath}:${getLineNumber(content, matchIndex)}`);
        }
        continue;
      }
      
      // Skip if already has radix
      if (hasRadix(content, matchIndex, fullMatch)) {
        if (verbose) {
          const lineNum = getLineNumber(content, matchIndex);
          const snippet = extractSnippet(content, matchIndex);
          console.log(`  Already has radix at ${filePath}:${lineNum}: ${snippet}`);
        }
        continue;
      }
      
      // Find insertion point
      const insertPoint = findInsertionPoint(content, matchIndex, fullMatch);
      if (insertPoint === -1) {
        console.warn(`  Warning: Could not find insertion point at ${filePath}:${getLineNumber(content, matchIndex)}`);
        continue;
      }
      
      fixes.push({
        index: insertPoint,
        line: getLineNumber(content, matchIndex),
        snippet: extractSnippet(content, matchIndex)
      });
    }
    
    if (fixes.length === 0) {
      return { modified: false, fixes: 0 };
    }
    
    // Apply fixes in reverse order to preserve indices
    let newContent = content;
    for (const fix of fixes.reverse()) {
      newContent = newContent.slice(0, fix.index) + `, ${CONFIG.radix}` + newContent.slice(fix.index);
    }
    
    // Write file
    if (!dryRun) {
      writeFileSync(filePath, newContent, 'utf-8');
    }
    
    // Report
    const relativePath = relative(process.cwd(), filePath);
    console.log(`${dryRun ? '[DRY-RUN] Would modify' : 'Modified'}: ${relativePath} (${fixes.length} fix${fixes.length > 1 ? 'es' : ''})`);
    
    if (verbose) {
      for (const fix of fixes.reverse()) { // Reverse back for display
        console.log(`  Line ${fix.line}: ${fix.snippet}`);
      }
    }
    
    stats.filesModified++;
    stats.totalFixes += fixes.length;
    
    return { modified: true, fixes: fixes.length };
    
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`Error processing ${filePath}: ${error.message}`);
    return { modified: false, fixes: 0, error: error.message };
  }
}

/**
 * Get line number from content index
 */
function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

/**
 * Extract a code snippet around the match
 */
function extractSnippet(content, index, maxLength = 60) {
  const lineStart = content.lastIndexOf('\n', index) + 1;
  const lineEnd = content.indexOf('\n', index);
  const line = content.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
  
  if (line.length <= maxLength) {
    return line.trim();
  }
  
  const matchPosInLine = index - lineStart;
  const start = Math.max(0, matchPosInLine - maxLength / 2);
  const end = Math.min(line.length, matchPosInLine + maxLength / 2);
  
  let snippet = line.substring(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < line.length) snippet = snippet + '...';
  
  return snippet;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  
  console.log('='.repeat(60));
  console.log('ParseInt Radix Fix Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no changes will be made)' : 'APPLY FIXES'}`);
  console.log(`Verbose: ${verbose ? 'YES' : 'NO'}`);
  console.log('-'.repeat(60));
  
  // Find all files
  const files = [];
  for (const pattern of CONFIG.includePatterns) {
    const matches = globSync(pattern, {
      absolute: true,
      ignore: CONFIG.excludePatterns
    });
    files.push(...matches);
  }
  
  // Remove duplicates
  const uniqueFiles = [...new Set(files)].sort();
  
  console.log(`Found ${uniqueFiles.length} files to scan\n`);
  
  // Process each file
  for (const file of uniqueFiles) {
    await processFile(file, { dryRun, verbose });
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Files scanned:     ${stats.filesScanned}`);
  console.log(`Files ${dryRun ? 'to modify' : 'modified'}: ${stats.filesModified}`);
  console.log(`Total fixes:       ${stats.totalFixes}`);
  
  if (stats.errors.length > 0) {
    console.log(`\nErrors: ${stats.errors.length}`);
    for (const { file, error } of stats.errors) {
      console.log(`  - ${relative(process.cwd(), file)}: ${error}`);
    }
  }
  
  console.log('='.repeat(60));
  
  if (dryRun && stats.totalFixes > 0) {
    console.log('\nTo apply these fixes, run without --dry-run flag');
  }
  
  // Exit with appropriate code
  process.exit(stats.errors.length > 0 ? 1 : 0);
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
