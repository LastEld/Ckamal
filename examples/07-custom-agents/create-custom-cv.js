#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Custom CV Example
 * 
 * This example demonstrates creating custom agent CVs:
 * 1. CV schema validation
 * 2. Creating custom CVs for different specializations
 * 3. Comparing CVs
 * 4. Agent pool integration
 * 5. Capability-based routing
 * 
 * @example
 *   node create-custom-cv.js
 * 
 * @module examples/07-custom-agents/create-custom-cv
 */

import { CogniMeshBIOS } from '../../src/bios/index.js';
import { 
  CVSchema, 
  validateCV, 
  createDefaultCV, 
  sanitizeCV, 
  diffCVs 
} from '../../src/bios/cv-schema.js';
import { OperatorConsole } from '../../src/bios/console.js';
import { AgentPool } from '../../src/gsd/agent-pool.js';
import { WORKER, SPECIALIST } from '../../src/gsd/agent-types.js';

// ============================================================
// Custom CV Example
// ============================================================

console.log('[CogniMesh v5.0] Custom CV Example');
console.log('===================================\n');

async function main() {
  const bios = new CogniMeshBIOS();
  await bios.boot();

  try {
    console.log('✅ BIOS booted\n');

    // ============================================================
    // Part 1: CV Schema Exploration
    // ============================================================
    
    console.log('--- CV Schema Validation ---\n');
    
    // Display schema structure
    console.log('CV Schema Structure:');
    console.log(`  Required fields: ${CVSchema.required.join(', ')}`);
    console.log(`  Total field categories: ${Object.keys(CVSchema.fields).length}\n`);

    // Example valid CV
    const validCV = {
      id: 'web-developer',
      name: 'Web Development Specialist',
      version: '1.0.0',
      description: 'Specialized in modern web development',
      capabilities: {
        languages: ['javascript', 'typescript', 'html', 'css'],
        domains: ['frontend', 'backend', 'fullstack'],
        tools: ['react', 'node', 'docker', 'git'],
        maxContextTokens: 100000,
        supportsStreaming: true,
        supportsVision: false
      },
      performance: {
        successRate: 0.95,
        avgLatency: 1500,
        qualityScore: 88,
        tasksCompleted: 150
      },
      specialization: {
        primary: 'fullstack',
        secondary: ['frontend', 'backend'],
        certifications: ['aws-certified-developer']
      },
      execution: {
        preferredClient: 'claude',
        fallbackClients: ['kimi'],
        parallelizable: true,
        retryPolicy: {
          maxRetries: 3,
          backoff: 'exponential'
        },
        timeout: 300000
      },
      resources: {
        minMemory: 512,
        maxMemory: 2048,
        priority: 7
      }
    };

    // Validate the CV
    const validation = validateCV(validCV);
    console.log(`Valid CV: ${validation.valid ? '✅' : '❌'}`);
    if (!validation.valid) {
      console.log('Errors:', validation.errors);
    } else {
      console.log(`   ID: ${validCV.id}`);
      console.log(`   Name: ${validCV.name}`);
      console.log(`   Languages: ${validCV.capabilities.languages.join(', ')}`);
      console.log(`   Domains: ${validCV.capabilities.domains.join(', ')}\n`);
    }

    // ============================================================
    // Part 2: Creating Default CV
    // ============================================================
    
    console.log('--- Creating Default CV ---\n');
    
    const defaultCV = createDefaultCV('default-agent', 'Default Agent');
    console.log('Default CV created:');
    console.log(JSON.stringify(defaultCV, null, 2));

    // ============================================================
    // Part 3: Creating Custom CVs
    // ============================================================
    
    console.log('\n--- Custom CV Examples ---\n');

    const customCVs = [
      {
        id: 'frontend-dev',
        name: 'Frontend Development Specialist',
        version: '1.0.0',
        capabilities: {
          languages: ['javascript', 'typescript', 'html', 'css'],
          domains: ['frontend', 'ui', 'ux'],
          tools: ['react', 'vue', 'webpack', 'jest', 'storybook'],
          maxContextTokens: 100000,
          supportsStreaming: true,
          supportsVision: true
        },
        specialization: {
          primary: 'frontend',
          secondary: ['ui-design', 'accessibility'],
          certifications: ['react-certified']
        },
        performance: {
          successRate: 0.94,
          avgLatency: 1800,
          qualityScore: 90
        }
      },
      {
        id: 'backend-dev',
        name: 'Backend Development Specialist',
        version: '1.0.0',
        capabilities: {
          languages: ['javascript', 'python', 'go', 'java'],
          domains: ['backend', 'api', 'database'],
          tools: ['node', 'express', 'postgres', 'redis', 'docker', 'kubernetes'],
          maxContextTokens: 150000,
          supportsStreaming: true,
          supportsVision: false
        },
        specialization: {
          primary: 'backend',
          secondary: ['microservices', 'devops'],
          certifications: ['aws-certified-solutions-architect']
        },
        performance: {
          successRate: 0.96,
          avgLatency: 2200,
          qualityScore: 92
        }
      },
      {
        id: 'ml-engineer',
        name: 'Machine Learning Engineer',
        version: '1.0.0',
        capabilities: {
          languages: ['python', 'r', 'julia'],
          domains: ['machine-learning', 'deep-learning', 'data-science'],
          tools: ['pytorch', 'tensorflow', 'jupyter', 'scikit-learn', 'docker'],
          maxContextTokens: 200000,
          supportsStreaming: true,
          supportsVision: true
        },
        specialization: {
          primary: 'machine-learning',
          secondary: ['computer-vision', 'nlp'],
          certifications: ['tensorflow-developer']
        },
        performance: {
          successRate: 0.91,
          avgLatency: 3500,
          qualityScore: 87
        }
      },
      {
        id: 'security-auditor',
        name: 'Security Auditor',
        version: '1.0.0',
        capabilities: {
          languages: ['python', 'javascript', 'go', 'rust'],
          domains: ['security', 'auditing', 'compliance'],
          tools: ['burp-suite', 'metasploit', 'wireshark', 'sonarqube'],
          maxContextTokens: 80000,
          supportsStreaming: true,
          supportsVision: false
        },
        specialization: {
          primary: 'security',
          secondary: ['penetration-testing', 'code-review'],
          certifications: ['oscp', 'ceh']
        },
        performance: {
          successRate: 0.98,
          avgLatency: 2800,
          qualityScore: 95
        }
      }
    ];

    // Validate each CV
    customCVs.forEach((cv, index) => {
      console.log(`\nCV ${index + 1}: ${cv.name}`);
      console.log(`ID: ${cv.id}`);
      
      const result = validateCV(cv);
      if (result.valid) {
        console.log('Validation: ✅ PASSED');
        console.log(`  Primary: ${cv.specialization.primary}`);
        console.log(`  Languages: ${cv.capabilities.languages.join(', ')}`);
        console.log(`  Tools: ${cv.capabilities.tools.slice(0, 3).join(', ')}...`);
        console.log(`  Quality Score: ${cv.performance.qualityScore}`);
      } else {
        console.log('Validation: ❌ FAILED');
        console.log('Errors:', result.errors);
      }
    });

    // Example of invalid CV (should fail validation)
    console.log('\n---\n');
    console.log('Invalid CV Example (should fail validation):');
    const invalidCV = {
      id: 'Invalid ID!',  // Invalid pattern
      name: '',           // Too short
      // Missing required 'capabilities'
    };
    
    const invalidResult = validateCV(invalidCV);
    console.log(`Validation: ${invalidResult.valid ? '✅' : '❌'}`);
    if (!invalidResult.valid) {
      console.log('Errors:');
      invalidResult.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
    }

    // ============================================================
    // Part 4: CV Comparison
    // ============================================================
    
    console.log('\n--- CV Comparison ---\n');
    
    const frontendCV = customCVs[0];
    const backendCV = customCVs[1];
    
    const differences = diffCVs(frontendCV, backendCV);
    
    console.log('Differences between frontend-dev and backend-dev:');
    if (Object.keys(differences.added).length > 0) {
      console.log('Added:', JSON.stringify(differences.added, null, 2));
    }
    if (Object.keys(differences.removed).length > 0) {
      console.log('Removed:', JSON.stringify(differences.removed, null, 2));
    }
    if (Object.keys(differences.changed).length > 0) {
      console.log('Changed:');
      Object.entries(differences.changed).forEach(([key, change]) => {
        console.log(`  ${key}:`);
        console.log(`    From: ${JSON.stringify(change.from)}`);
        console.log(`    To: ${JSON.stringify(change.to)}`);
      });
    }

    // ============================================================
    // Part 5: Sanitization
    // ============================================================
    
    console.log('\n--- CV Sanitization ---\n');
    
    const dirtyCV = {
      id: 'test-agent',
      name: 'Test Agent',
      version: '1.0.0',
      capabilities: {
        languages: ['javascript'],
        domains: ['test'],
        tools: [],
        maxContextTokens: 100000,
        supportsStreaming: true,
        supportsVision: null  // Will be removed
      },
      undefinedField: undefined,  // Will be removed
      nullField: null,           // Will be removed
      emptyObject: {},           // Will be removed
      validField: 'kept'         // Will be kept
    };

    console.log('Before sanitization:');
    console.log(`  Keys: ${Object.keys(dirtyCV).join(', ')}`);
    console.log(`  capabilities keys: ${Object.keys(dirtyCV.capabilities).join(', ')}`);

    const sanitizedCV = sanitizeCV(dirtyCV);
    
    console.log('\nAfter sanitization:');
    console.log(`  Keys: ${Object.keys(sanitizedCV).join(', ')}`);
    console.log(`  capabilities keys: ${Object.keys(sanitizedCV.capabilities).join(', ')}`);

    // ============================================================
    // Part 6: Agent Pool Integration
    // ============================================================
    
    console.log('\n--- Agent Pool Integration ---\n');
    
    const console_ = new OperatorConsole(bios);
    
    // Spawn agents with different CVs
    console.log('Spawning agents with custom CVs:\n');
    
    for (const cv of customCVs) {
      const result = await console_.execute(`agents spawn ${cv.id}`);
      if (result.success) {
        console.log(`✅ Spawned ${cv.id} (ID: ${result.data.agentId})`);
        
        // Store CV reference on agent (in real implementation)
        const agent = console_.agents.get(result.data.agentId);
        if (agent) {
          agent.cvData = cv;
        }
      }
    }

    // Show agent list
    console.log('\nAgent List:');
    const agentList = await console_.execute('agents list');
    console.log(agentList.formatted || JSON.stringify(agentList.data, null, 2));

    // ============================================================
    // Part 7: Capability-Based Routing
    // ============================================================
    
    console.log('\n--- Capability-Based Routing ---\n');
    
    function findBestAgentForTask(task, agents) {
      let bestMatch = null;
      let bestScore = 0;

      for (const [, agent] of agents) {
        if (!agent.cvData) continue;
        
        const cv = agent.cvData;
        let score = 0;

        // Match languages
        if (task.languages) {
          const matches = task.languages.filter(l => 
            cv.capabilities.languages.includes(l)
          ).length;
          score += (matches / task.languages.length) * 0.3;
        }

        // Match domains
        if (task.domains) {
          const matches = task.domains.filter(d => 
            cv.capabilities.domains.includes(d)
          ).length;
          score += (matches / task.domains.length) * 0.4;
        }

        // Match tools
        if (task.tools) {
          const matches = task.tools.filter(t => 
            cv.capabilities.tools.includes(t)
          ).length;
          score += (matches / task.tools.length) * 0.2;
        }

        // Quality score bonus
        score += (cv.performance.qualityScore / 100) * 0.1;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = agent;
        }
      }

      return { agent: bestMatch, score: bestScore };
    }

    // Test routing
    const testTasks = [
      {
        name: 'Build React component',
        languages: ['javascript', 'typescript'],
        domains: ['frontend'],
        tools: ['react']
      },
      {
        name: 'Train neural network',
        languages: ['python'],
        domains: ['machine-learning'],
        tools: ['pytorch']
      },
      {
        name: 'Design database schema',
        languages: ['javascript', 'sql'],
        domains: ['backend', 'database'],
        tools: ['postgres']
      },
      {
        name: 'Security audit',
        languages: ['python'],
        domains: ['security'],
        tools: ['burp-suite']
      }
    ];

    testTasks.forEach(task => {
      const { agent, score } = findBestAgentForTask(task, console_.agents);
      if (agent) {
        console.log(`Task: ${task.name}`);
        console.log(`  Best match: ${agent.cvData.id} (score: ${score.toFixed(2)})`);
        console.log(`  Primary: ${agent.cvData.specialization.primary}`);
        console.log();
      }
    });

    // ============================================================
    // Part 8: CV Registry Concept
    // ============================================================
    
    console.log('--- CV Registry ---\n');
    
    // In a real implementation, you'd use CVRegistry
    // For demo, we'll show the concept
    const cvRegistry = {
      cvs: new Map(),
      
      register(cv) {
        const validation = validateCV(cv);
        if (!validation.valid) {
          throw new Error(`Invalid CV: ${validation.errors.join(', ')}`);
        }
        this.cvs.set(cv.id, cv);
        return cv.id;
      },
      
      get(id) {
        return this.cvs.get(id);
      },
      
      findByCapability(capability, value) {
        const results = [];
        for (const cv of this.cvs.values()) {
          if (cv.capabilities[capability]?.includes(value)) {
            results.push(cv);
          }
        }
        return results;
      },
      
      list() {
        return Array.from(this.cvs.values());
      }
    };

    // Register all CVs
    customCVs.forEach(cv => cvRegistry.register(cv));
    
    console.log(`Registered CVs: ${cvRegistry.list().length}`);
    console.log('\nFind by capability (languages=python):');
    const pythonDevs = cvRegistry.findByCapability('languages', 'python');
    pythonDevs.forEach(cv => {
      console.log(`  - ${cv.id}: ${cv.name}`);
    });

    console.log('\n✅ Custom CV example complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await bios.shutdown();
    console.log('\n✅ BIOS shutdown complete');
  }
}

main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. CV Structure:
//    - id, name, version (required)
//    - capabilities (languages, domains, tools)
//    - performance metrics
//    - specialization details
//    - execution preferences
//
// 2. Validation:
//    - validateCV() checks against schema
//    - Returns detailed error messages
//    - Type checking for all fields
//
// 3. CV Creation:
//    - createDefaultCV() for quick starts
//    - Custom CVs for specific domains
//    - Specialization tracking
//
// 4. CV Management:
//    - sanitizeCV() - clean undefined/null
//    - diffCVs() - compare two CVs
//    - Registry pattern for storage
//
// 5. Capability-Based Routing:
//    - Match tasks to agents by capabilities
//    - Scoring algorithm for best match
//    - Multi-factor matching (languages, domains, tools)
//
// 6. Agent Types:
//    - WORKER: General purpose
//    - COORDINATOR: Manages others
//    - SPECIALIST: Domain expert
//
// ============================================================
