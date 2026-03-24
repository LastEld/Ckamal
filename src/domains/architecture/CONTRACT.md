# Architecture Domain Contract

## Overview

The Architecture Domain provides project structure analysis, pattern detection, and architectural recommendations for CogniMesh.

## Interface

### ArchitectureAnalyzer Class

```javascript
import { ArchitectureAnalyzer } from './domains/architecture/index.js';

const analyzer = new ArchitectureAnalyzer();
```

#### Methods

##### analyzeProject(rootPath)
Analyzes entire project structure and returns comprehensive analysis.

- **Parameters:**
  - `rootPath` (string): Project root directory path
- **Returns:** `Promise<ArchitectureAnalysis>`
- **Events:**
  - `analysisStarted` - Fired when analysis begins
  - `analysisComplete` - Fired when analysis finishes successfully
  - `analysisError` - Fired when analysis fails

##### detectPatterns(files)
Detects architectural patterns from file list.

- **Parameters:**
  - `files` (string[]): Array of file paths
- **Returns:** `Promise<PatternDetection[]>`
- **Events:**
  - `patternsDetected` - Fired when patterns are identified

##### generateRecommendations(analysis)
Generates architectural recommendations based on analysis.

- **Parameters:**
  - `analysis` (Object): Analysis data with `files` and `patterns`
- **Returns:** `ArchitectureRecommendation[]`
- **Events:**
  - `recommendationsGenerated` - Fired when recommendations are ready

##### validateArchitecture(rules, projectPath)
Validates project against defined architecture rules.

- **Parameters:**
  - `rules` (ArchitectureRule[]): Rules to validate
  - `projectPath` (string, optional): Project path (uses last analysis if omitted)
- **Returns:** `Promise<ValidationResult[]>`
- **Events:**
  - `validationComplete` - Fired when validation finishes

## Types

### ArchitectureAnalysis
```typescript
interface ArchitectureAnalysis {
  projectPath: string;
  timestamp: string;
  patterns: PatternDetection[];
  recommendations: ArchitectureRecommendation[];
  validations: ValidationResult[];
}
```

### PatternDetection
```typescript
interface PatternDetection {
  name: string;
  type: 'structural' | 'behavioral' | 'deployment' | 'other';
  confidence: number; // 0-1
  files: string[];
  metadata: object;
}
```

### ArchitectureRecommendation
```typescript
interface ArchitectureRecommendation {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion?: string;
  affectedFiles?: string[];
}
```

### ValidationResult
```typescript
interface ValidationResult {
  ruleId: string;
  passed: boolean;
  message: string;
  details?: string;
}
```

### ArchitectureRule
```typescript
interface ArchitectureRule {
  id: string;
  name: string;
  type: 'file-count' | 'dependency' | 'naming' | 'custom';
  criteria: {
    pattern?: string;
    maxFiles?: number;
    allowedDependencies?: string[];
    // additional criteria based on type
  };
}
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `analysisStarted` | `{ analysisId, rootPath, timestamp }` | Analysis initiated |
| `analysisComplete` | `{ analysisId, analysis }` | Analysis finished |
| `analysisError` | `{ analysisId, error }` | Analysis failed |
| `patternsDetected` | `{ patterns, fileCount }` | Patterns identified |
| `recommendationsGenerated` | `{ recommendations, count }` | Recommendations ready |
| `validationComplete` | `{ results, passed }` | Validation finished |

## Usage Examples

### Basic Analysis
```javascript
const analyzer = new ArchitectureAnalyzer();
const analysis = await analyzer.analyzeProject('./my-project');
console.log(analysis.patterns);
console.log(analysis.recommendations);
```

### Pattern Detection
```javascript
const files = ['src/controllers/user.js', 'src/services/userService.js'];
const patterns = await analyzer.detectPatterns(files);
patterns.forEach(p => console.log(`${p.name}: ${p.confidence}`));
```

### Architecture Validation
```javascript
const rules = [
  {
    id: 'max-files',
    name: 'Maximum File Count',
    type: 'file-count',
    criteria: { maxFiles: 100 }
  },
  {
    id: 'naming-convention',
    name: 'Naming Convention',
    type: 'naming',
    criteria: { pattern: '^[a-z][a-zA-Z0-9]*\\.js$' }
  }
];

const results = await analyzer.validateArchitecture(rules, './project');
results.forEach(r => console.log(`${r.ruleId}: ${r.passed ? 'PASS' : 'FAIL'}`));
```

### Event Handling
```javascript
analyzer.on('analysisComplete', ({ analysisId, analysis }) => {
  console.log(`Analysis ${analysisId} complete`);
  console.log(`Found ${analysis.patterns.length} patterns`);
});
```

## Dependencies

- Node.js `events` module
- Node.js `fs/promises` module
- Node.js `path` module

## Error Handling

All async methods may throw:
- `ENOENT`: Project path not found
- `EACCES`: Permission denied
- `Error`: Analysis or validation errors

Always wrap calls in try-catch blocks for production use.
