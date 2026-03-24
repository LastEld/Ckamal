# 07 - Custom Agents

> **Difficulty:** ⭐⭐⭐ Advanced  
> **Time:** 20 minutes

## Overview

This example demonstrates creating custom agents with specialized CVs (Curriculum Vitae) for specific tasks and domains.

## Concepts Covered

- CV schema and validation
- Creating custom CVs
- Agent specialization
- Agent capabilities
- Performance tracking
- Agent lifecycle management

## Files

### create-custom-cv.js
Demonstrates the complete CV creation workflow:
1. CV schema validation
2. Creating custom CVs
3. Registering with agent pool
4. Capability-based routing

## Key APIs

### CV Schema

The CV schema defines agent capabilities:

```javascript
CVSchema = {
  required: ['id', 'name', 'version', 'capabilities'],
  fields: {
    id: { type: 'string', pattern: /^[a-z0-9_-]+$/ },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    version: { type: 'string', pattern: /^\d+\.\d+\.\d+/ },
    
    capabilities: {
      languages: ['javascript', 'python', ...],
      domains: ['web', 'ml', 'security', ...],
      tools: ['git', 'docker', 'aws', ...],
      maxContextTokens: 100000,
      supportsStreaming: true,
      supportsVision: true
    },
    
    performance: {
      successRate: 0.95,
      avgLatency: 2000,
      qualityScore: 85
    },
    
    specialization: {
      primary: 'backend',
      secondary: ['api', 'database'],
      certifications: ['aws-certified']
    }
  }
}
```

### CV Functions

#### `validateCV(cv)`
Validates a CV against the schema.

Returns:
```javascript
{ valid: boolean, errors: string[] }
```

#### `createDefaultCV(id, name)`
Creates a default CV with required fields.

#### `sanitizeCV(cv)`
Removes undefined/null values from a CV.

#### `diffCVs(cv1, cv2)`
Compares two CVs and returns differences.

Returns:
```javascript
{ added: {}, removed: {}, changed: {} }
```

### Agent Types

```javascript
WORKER      // General purpose task executor
COORDINATOR // Manages other agents
SPECIALIST  // Domain-specific expert
```

### Agent Capabilities

| Capability | Description |
|------------|-------------|
| `languages` | Programming languages supported |
| `domains` | Knowledge domains |
| `tools` | Tools the agent can use |
| `maxContextTokens` | Maximum context window |
| `supportsStreaming` | Can stream responses |
| `supportsVision` | Can process images |
| `supportsFunctionCalling` | Can call functions/tools |

## Expected Output (create-custom-cv.js)

```
[CogniMesh v5.0] Custom CV Example
===================================

✅ BIOS booted

--- CV Schema Validation ---

Valid CV: ✅
   ID: web-developer
   Name: Web Development Specialist
   Languages: javascript, typescript, html, css
   Domains: frontend, backend, fullstack

--- Creating Default CV ---

Default CV created:
{
  "id": "default-agent",
  "name": "Default Agent",
  "version": "1.0.0",
  "capabilities": {
    "languages": [],
    "domains": [],
    "tools": [],
    "maxContextTokens": 100000,
    "supportsStreaming": true,
    "supportsVision": false
  }
}

--- Custom CV Examples ---

CV 1: Frontend Specialist
{
  "id": "frontend-dev",
  "name": "Frontend Development Specialist",
  "capabilities": {
    "languages": ["javascript", "typescript", "html", "css"],
    "domains": ["frontend", "ui", "ux"],
    "tools": ["react", "vue", "webpack", "jest"]
  }
}

Validation: ✅ PASSED

CV 2: ML Engineer
{
  "id": "ml-engineer",
  "name": "Machine Learning Engineer",
  "capabilities": {
    "languages": ["python", "r", "julia"],
    "domains": ["machine-learning", "deep-learning", "data-science"],
    "tools": ["pytorch", "tensorflow", "jupyter", "docker"]
  }
}

Validation: ✅ PASSED

CV 3: Invalid CV (should fail)
Validation: ❌ FAILED
Errors:
  - Missing required field: capabilities
  - id does not match required pattern

--- CV Comparison ---

Diff between frontend-dev and backend-dev:
Added: { domains: ['backend'], tools: ['nodejs', 'postgres'] }
Changed: { 
  domains: { from: ['frontend'], to: ['backend'] },
  tools: { from: ['react'], to: ['express'] }
}

--- Agent Pool Integration ---

Spawning agents with custom CVs:
✅ Spawned frontend-dev (ID: sa-00)
✅ Spawned backend-dev (ID: sa-01)
✅ Spawned ml-engineer (ID: sa-02)

Agent Pool Status:
Total agents: 3
Active: 3
Specializations: frontend, backend, ml

--- Capability-Based Routing ---

Task: Build React component
Best match: frontend-dev (score: 0.95)

Task: Train neural network
Best match: ml-engineer (score: 0.92)

Task: Design database schema
Best match: backend-dev (score: 0.88)

✅ Custom CV example complete!
```

## Next Steps

Now that you understand custom agents:

- [08-advanced](../08-advanced/) - Learn advanced middleware and event handling
