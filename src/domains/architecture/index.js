/**
 * @fileoverview Architecture Domain - Project architecture analysis and recommendations
 * @module domains/architecture
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Architecture analysis result
 * @typedef {Object} ArchitectureAnalysis
 * @property {string} projectPath - Analyzed project path
 * @property {string} timestamp - ISO timestamp of analysis
 * @property {PatternDetection[]} patterns - Detected patterns
 * @property {ArchitectureRecommendation[]} recommendations - Generated recommendations
 * @property {ValidationResult[]} validations - Validation results
 */

/**
 * Detected pattern
 * @typedef {Object} PatternDetection
 * @property {string} name - Pattern name
 * @property {string} type - Pattern type (structural, behavioral, etc.)
 * @property {number} confidence - Confidence score (0-1)
 * @property {string[]} files - Related files
 * @property {Object} metadata - Additional pattern metadata
 */

/**
 * Architecture recommendation
 * @typedef {Object} ArchitectureRecommendation
 * @property {string} id - Unique identifier
 * @property {string} category - Recommendation category
 * @property {string} severity - Severity level (info, warning, error)
 * @property {string} message - Recommendation message
 * @property {string} [suggestion] - Suggested fix or improvement
 * @property {string[]} [affectedFiles] - Files affected by this recommendation
 */

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {string} ruleId - Rule identifier
 * @property {boolean} passed - Whether validation passed
 * @property {string} message - Validation message
 * @property {string} [details] - Additional details
 */

/**
 * Architecture rule for validation
 * @typedef {Object} ArchitectureRule
 * @property {string} id - Rule identifier
 * @property {string} name - Rule name
 * @property {string} type - Rule type (file-count, dependency, naming, etc.)
 * @property {Object} criteria - Rule criteria
 * @property {string} [criteria.pattern] - File pattern to match
 * @property {number} [criteria.maxFiles] - Maximum allowed files
 * @property {string[]} [criteria.allowedDependencies] - Allowed dependencies
 */

/**
 * Analyzes project architecture patterns and structure
 * @extends EventEmitter
 */
export class ArchitectureAnalyzer extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, ArchitectureAnalysis>} */
    this.analyses = new Map();
    /** @type {Set<string>} */
    this.supportedExtensions = new Set(['.js', '.ts', '.jsx', '.tsx', '.json', '.md']);
  }

  /**
   * Analyzes entire project structure
   * @param {string} rootPath - Project root directory path
   * @returns {Promise<ArchitectureAnalysis>} Complete project analysis
   * @fires ArchitectureAnalyzer#analysisStarted
   * @fires ArchitectureAnalyzer#analysisComplete
   */
  async analyzeProject(rootPath) {
    const timestamp = new Date().toISOString();
    const analysisId = `${rootPath}-${timestamp}`;

    /** @event ArchitectureAnalyzer#analysisStarted */
    this.emit('analysisStarted', { analysisId, rootPath, timestamp });

    try {
      const files = await this.#discoverFiles(rootPath);
      const patterns = await this.detectPatterns(files);
      const recommendations = this.generateRecommendations({ files, patterns });
      
      /** @type {ArchitectureAnalysis} */
      const analysis = {
        projectPath: rootPath,
        timestamp,
        patterns,
        recommendations,
        validations: []
      };

      this.analyses.set(analysisId, analysis);

      /** @event ArchitectureAnalyzer#analysisComplete */
      this.emit('analysisComplete', { analysisId, analysis });

      return analysis;
    } catch (error) {
      /** @event ArchitectureAnalyzer#analysisError */
      this.emit('analysisError', { analysisId, error });
      throw error;
    }
  }

  /**
   * Discovers all relevant files in project
   * @private
   * @param {string} rootPath - Project root path
   * @param {string[]} [excludePatterns=['node_modules', '.git', 'dist', 'build']] - Patterns to exclude
   * @returns {Promise<string[]>} Array of file paths
   */
  async #discoverFiles(rootPath, excludePatterns = ['node_modules', '.git', 'dist', 'build']) {
    const files = [];
    
    const scanDir = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        
        if (excludePatterns.some(p => relativePath.includes(p))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (this.supportedExtensions.has(path.extname(entry.name))) {
          files.push(relativePath);
        }
      }
    };
    
    await scanDir(rootPath);
    return files;
  }

  /**
   * Detects architectural patterns from project files
   * @param {string[]} files - Array of file paths
   * @returns {Promise<PatternDetection[]>} Detected patterns
   */
  async detectPatterns(files) {
    /** @type {PatternDetection[]} */
    const patterns = [];

    // Detect layered architecture
    const hasLayeredStructure = this.#detectLayeredArchitecture(files);
    if (hasLayeredStructure.detected) {
      patterns.push({
        name: 'LayeredArchitecture',
        type: 'structural',
        confidence: hasLayeredStructure.confidence,
        files: hasLayeredStructure.files,
        metadata: { layers: hasLayeredStructure.layers }
      });
    }

    // Detect modular structure
    const hasModularStructure = this.#detectModularArchitecture(files);
    if (hasModularStructure.detected) {
      patterns.push({
        name: 'ModularArchitecture',
        type: 'structural',
        confidence: hasModularStructure.confidence,
        files: hasModularStructure.files,
        metadata: { modules: hasModularStructure.modules }
      });
    }

    // Detect microservices patterns
    const hasMicroservices = this.#detectMicroservicesPattern(files);
    if (hasMicroservices.detected) {
      patterns.push({
        name: 'MicroservicesPattern',
        type: 'deployment',
        confidence: hasMicroservices.confidence,
        files: hasMicroservices.files,
        metadata: { services: hasMicroservices.services }
      });
    }

    /** @event ArchitectureAnalyzer#patternsDetected */
    this.emit('patternsDetected', { patterns, fileCount: files.length });

    return patterns;
  }

  /**
   * Detects layered architecture pattern
   * @private
   * @param {string[]} files - Project files
   * @returns {Object} Detection result
   */
  #detectLayeredArchitecture(files) {
    const layers = new Set();
    const layerPatterns = {
      controllers: /controllers?|handlers?/i,
      services: /services?|business/i,
      repositories: /repositories?|daos?|data/i,
      models: /models?|entities?/i,
      views: /views?|ui|components/i
    };

    for (const file of files) {
      for (const [layer, pattern] of Object.entries(layerPatterns)) {
        if (pattern.test(file)) {
          layers.add(layer);
        }
      }
    }

    const layerArray = Array.from(layers);
    const confidence = Math.min(layerArray.length / 3, 1);

    return {
      detected: layerArray.length >= 2,
      confidence,
      files: files.filter(f => 
        Object.values(layerPatterns).some(p => p.test(f))
      ),
      layers: layerArray
    };
  }

  /**
   * Detects modular architecture pattern
   * @private
   * @param {string[]} files - Project files
   * @returns {Object} Detection result
   */
  #detectModularArchitecture(files) {
    const modulePattern = /(?:^|\/)([\w-]+)\/\1\.(?:js|ts|jsx|tsx)$/;
    const modules = new Set();
    const moduleFiles = [];

    for (const file of files) {
      const match = file.match(modulePattern);
      if (match) {
        modules.add(match[1]);
        moduleFiles.push(file);
      }
    }

    const moduleArray = Array.from(modules);
    const confidence = Math.min(moduleArray.length / 5, 1);

    return {
      detected: moduleArray.length >= 2,
      confidence,
      files: moduleFiles,
      modules: moduleArray
    };
  }

  /**
   * Detects microservices pattern
   * @private
   * @param {string[]} files - Project files
   * @returns {Object} Detection result
   */
  #detectMicroservicesPattern(files) {
    const servicePatterns = [
      /services?\/[^/]+\/package\.json$/,
      /api\/[^/]+\/server\.(js|ts)$/,
      /microservices?\/[^/]+\//i
    ];

    const services = new Set();
    const serviceFiles = [];

    for (const file of files) {
      for (const pattern of servicePatterns) {
        if (pattern.test(file)) {
          const serviceMatch = file.match(/([^/]+)\//);
          if (serviceMatch) {
            services.add(serviceMatch[1]);
          }
          serviceFiles.push(file);
        }
      }
    }

    const serviceArray = Array.from(services);
    const confidence = Math.min(serviceArray.length / 3, 1);

    return {
      detected: serviceArray.length >= 2 || 
                files.some(f => f.includes('docker-compose') || f.includes('k8s')),
      confidence,
      files: serviceFiles,
      services: serviceArray
    };
  }

  /**
   * Generates recommendations based on analysis
   * @param {Object} analysis - Analysis data
   * @param {string[]} analysis.files - Project files
   * @param {PatternDetection[]} analysis.patterns - Detected patterns
   * @returns {ArchitectureRecommendation[]} Generated recommendations
   */
  generateRecommendations(analysis) {
    /** @type {ArchitectureRecommendation[]} */
    const recommendations = [];

    // Check for test coverage
    const testFiles = analysis.files.filter(f => 
      f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
    );
    const testRatio = testFiles.length / (analysis.files.length || 1);
    
    if (testRatio < 0.1) {
      recommendations.push({
        id: `rec-${Date.now()}-001`,
        category: 'Testing',
        severity: 'warning',
        message: 'Low test coverage detected',
        suggestion: 'Consider adding unit tests for critical components',
        affectedFiles: analysis.files.filter(f => !f.includes('test'))
      });
    }

    // Check for documentation
    const hasReadme = analysis.files.some(f => 
      /^readme\.md$/i.test(path.basename(f))
    );
    if (!hasReadme) {
      recommendations.push({
        id: `rec-${Date.now()}-002`,
        category: 'Documentation',
        severity: 'info',
        message: 'No README.md found at project root',
        suggestion: 'Add a README.md with project description and setup instructions'
      });
    }

    // Check for configuration files
    const configFiles = analysis.files.filter(f => 
      f.includes('.config.') || f.includes('eslint') || f.includes('prettier')
    );
    if (configFiles.length < 2) {
      recommendations.push({
        id: `rec-${Date.now()}-003`,
        category: 'Configuration',
        severity: 'warning',
        message: 'Limited configuration files detected',
        suggestion: 'Consider adding ESLint, Prettier, or other tooling configurations'
      });
    }

    // Pattern-specific recommendations
    const hasLayered = analysis.patterns.some(p => p.name === 'LayeredArchitecture');
    const hasModular = analysis.patterns.some(p => p.name === 'ModularArchitecture');

    if (!hasLayered && !hasModular && analysis.files.length > 20) {
      recommendations.push({
        id: `rec-${Date.now()}-004`,
        category: 'Architecture',
        severity: 'warning',
        message: 'No clear architectural pattern detected',
        suggestion: 'Consider organizing code into layers or modules for better maintainability'
      });
    }

    /** @event ArchitectureAnalyzer#recommendationsGenerated */
    this.emit('recommendationsGenerated', { 
      recommendations, 
      count: recommendations.length 
    });

    return recommendations;
  }

  /**
   * Validates architecture against defined rules
   * @param {ArchitectureRule[]} rules - Rules to validate
   * @param {string} [projectPath] - Optional project path (uses last analysis if not provided)
   * @returns {Promise<ValidationResult[]>} Validation results
   */
  async validateArchitecture(rules, projectPath) {
    /** @type {ValidationResult[]} */
    const results = [];

    for (const rule of rules) {
      /** @type {ValidationResult} */
      const result = {
        ruleId: rule.id,
        passed: true,
        message: `Rule "${rule.name}" passed`
      };

      try {
        switch (rule.type) {
          case 'file-count':
            const files = await this.#discoverFiles(projectPath || '.');
            if (rule.criteria.maxFiles && files.length > rule.criteria.maxFiles) {
              result.passed = false;
              result.message = `Too many files (${files.length} > ${rule.criteria.maxFiles})`;
            }
            break;

          case 'naming':
            if (rule.criteria.pattern) {
              const allFiles = await this.#discoverFiles(projectPath || '.');
              const invalidFiles = allFiles.filter(f => 
                !new RegExp(rule.criteria.pattern).test(path.basename(f))
              );
              if (invalidFiles.length > 0) {
                result.passed = false;
                result.message = `Files with invalid naming: ${invalidFiles.join(', ')}`;
              }
            }
            break;

          case 'dependency':
            // Simplified dependency validation
            result.details = 'Dependency validation requires package.json analysis';
            break;

          default:
            result.passed = false;
            result.message = `Unknown rule type: ${rule.type}`;
        }
      } catch (error) {
        result.passed = false;
        result.message = `Validation error: ${error.message}`;
        result.details = error.stack;
      }

      results.push(result);
    }

    /** @event ArchitectureAnalyzer#validationComplete */
    this.emit('validationComplete', { 
      results, 
      passed: results.every(r => r.passed) 
    });

    return results;
  }

  /**
   * Gets analysis by ID
   * @param {string} analysisId - Analysis identifier
   * @returns {ArchitectureAnalysis|undefined} Analysis result
   */
  getAnalysis(analysisId) {
    return this.analyses.get(analysisId);
  }

  /**
   * Gets all stored analyses
   * @returns {Map<string, ArchitectureAnalysis>} All analyses
   */
  getAllAnalyses() {
    return new Map(this.analyses);
  }

  /**
   * Clears stored analyses
   * @param {string} [analysisId] - Specific analysis to clear (clears all if omitted)
   */
  clearAnalyses(analysisId) {
    if (analysisId) {
      this.analyses.delete(analysisId);
    } else {
      this.analyses.clear();
    }
  }
}

// Export singleton instance
export const architectureAnalyzer = new ArchitectureAnalyzer();
export default ArchitectureAnalyzer;
