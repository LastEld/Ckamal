/**
 * @fileoverview Analysis MCP Tools
 * Provides code analysis, architecture review, and reporting capabilities.
 * @module tools/definitions/analysis-tools
 */

import { z } from 'zod';
import { createTool, createResponseSchema } from '../definition-helpers.js';

// Common schemas
const SeverityLevel = z.enum(['info', 'low', 'medium', 'high', 'critical']);

const CodeIssueSchema = z.object({
  file: z.string(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  severity: SeverityLevel,
  rule: z.string(),
  message: z.string(),
  suggestion: z.string().optional(),
  code: z.string().optional()
});

const ArchitectureIssueSchema = z.object({
  type: z.enum(['coupling', 'cohesion', 'complexity', 'duplication', 'dependency']),
  severity: SeverityLevel,
  component: z.string(),
  description: z.string(),
  recommendation: z.string(),
  affectedFiles: z.array(z.string())
});

const DependencySchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(['production', 'development', 'peer', 'optional']),
  license: z.string().optional(),
  vulnerabilities: z.array(z.object({
    id: z.string(),
    severity: SeverityLevel,
    description: z.string()
  })).optional(),
  outdated: z.boolean().optional(),
  latestVersion: z.string().optional()
});

const PerformanceMetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  threshold: z.number().optional(),
  status: z.enum(['good', 'warning', 'critical']).optional()
});

const SecurityIssueSchema = z.object({
  id: z.string(),
  severity: SeverityLevel,
  category: z.enum(['injection', 'auth', 'secrets', 'csrf', 'xss', 'config', 'dependency']),
  file: z.string(),
  line: z.number().int().optional(),
  description: z.string(),
  remediation: z.string(),
  cwe: z.string().optional(),
  owasp: z.string().optional()
});

const PatternMatchSchema = z.object({
  pattern: z.string(),
  file: z.string(),
  line: z.number().int(),
  context: z.string(),
  confidence: z.number().min(0).max(1)
});

const DiffChangeSchema = z.object({
  file: z.string(),
  type: z.enum(['added', 'modified', 'deleted', 'renamed']),
  additions: z.number().int(),
  deletions: z.number().int(),
  issues: z.array(CodeIssueSchema).optional()
});

const CoverageDataSchema = z.object({
  file: z.string(),
  lines: z.object({
    total: z.number().int(),
    covered: z.number().int(),
    percentage: z.number().min(0).max(100)
  }),
  functions: z.object({
    total: z.number().int(),
    covered: z.number().int(),
    percentage: z.number().min(0).max(100)
  }),
  branches: z.object({
    total: z.number().int(),
    covered: z.number().int(),
    percentage: z.number().min(0).max(100)
  }).optional()
});

// Response schemas
const CodeAnalysisResponse = createResponseSchema(z.object({
  summary: z.object({
    totalFiles: z.number().int(),
    totalLines: z.number().int(),
    issuesBySeverity: z.record(z.number())
  }),
  issues: z.array(CodeIssueSchema),
  metrics: z.object({
    complexity: z.number(),
    maintainability: z.number(),
    duplication: z.number()
  })
}));

const ArchitectureResponse = createResponseSchema(z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  issues: z.array(ArchitectureIssueSchema),
  recommendations: z.array(z.string()),
  diagram: z.string().optional() // Mermaid or PlantUML
}));

const DependenciesResponse = createResponseSchema(z.object({
  direct: z.array(DependencySchema),
  transitive: z.array(DependencySchema),
  vulnerabilities: z.array(z.object({
    dependency: z.string(),
    severity: SeverityLevel,
    issues: z.array(z.object({
      id: z.string(),
      description: z.string(),
      fixedIn: z.string().optional()
    }))
  })),
  licenses: z.record(z.array(z.string()))
}));

const PerformanceResponse = createResponseSchema(z.object({
  metrics: z.array(PerformanceMetricSchema),
  bottlenecks: z.array(z.object({
    name: z.string(),
    severity: SeverityLevel,
    location: z.string(),
    suggestion: z.string()
  })),
  trends: z.array(z.object({
    metric: z.string(),
    current: z.number(),
    previous: z.number(),
    change: z.number()
  }))
}));

const SecurityResponse = createResponseSchema(z.object({
  score: z.number().min(0).max(100),
  criticalIssues: z.number().int(),
  highIssues: z.number().int(),
  mediumIssues: z.number().int(),
  lowIssues: z.number().int(),
  issues: z.array(SecurityIssueSchema),
  secrets: z.array(z.object({
    type: z.string(),
    file: z.string(),
    line: z.number().int(),
    preview: z.string()
  }))
}));

const PatternsResponse = createResponseSchema(z.object({
  patterns: z.array(z.object({
    name: z.string(),
    description: z.string(),
    matches: z.array(PatternMatchSchema),
    occurrences: z.number().int()
  })),
  suggestions: z.array(z.string())
}));

const DiffAnalysisResponse = createResponseSchema(z.object({
  summary: z.object({
    filesChanged: z.number().int(),
    additions: z.number().int(),
    deletions: z.number().int(),
    testCoverage: z.number().optional()
  }),
  changes: z.array(DiffChangeSchema),
  risk: z.object({
    level: z.enum(['low', 'medium', 'high']),
    factors: z.array(z.string())
  })
}));

const CoverageResponse = createResponseSchema(z.object({
  overall: z.object({
    lines: z.number().min(0).max(100),
    functions: z.number().min(0).max(100),
    branches: z.number().min(0).max(100)
  }),
  files: z.array(CoverageDataSchema),
  uncovered: z.array(z.object({
    file: z.string(),
    lines: z.array(z.number().int())
  }))
}));

const ReportResponse = createResponseSchema(z.object({
  reportId: z.string(),
  format: z.enum(['html', 'pdf', 'markdown', 'json']),
  url: z.string().optional(),
  summary: z.string()
}));

const RagAnalysisResponse = createResponseSchema(z.object({
  query: z.string(),
  sources: z.array(z.object({
    file: z.string(),
    relevance: z.number().min(0).max(1),
    excerpt: z.string()
  })),
  answer: z.string(),
  confidence: z.number().min(0).max(1)
}));

/**
 * Analysis Tools Export
 */
export const analysisTools = [
  /**
   * Analyze code quality
   */
  createTool({
    name: 'analyze_code',
    description: 'Perform static code analysis to detect issues, measure complexity, and calculate quality metrics',
    inputSchema: z.object({
      path: z.string(),
      language: z.enum(['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'csharp']).optional(),
      rules: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
      severity: z.array(SeverityLevel).default(['low', 'medium', 'high', 'critical'])
    }),
    outputSchema: CodeAnalysisResponse,
    handler: async (params) => {
      // Implementation would run actual analysis
      return {
        success: true,
        data: {
          summary: {
            totalFiles: 0,
            totalLines: 0,
            issuesBySeverity: {}
          },
          issues: [],
          metrics: {
            complexity: 0,
            maintainability: 0,
            duplication: 0
          }
        }
      };
    },
    tags: ['analysis', 'code', 'quality']
  }),

  /**
   * Analyze architecture
   */
  createTool({
    name: 'analyze_architecture',
    description: 'Analyze codebase architecture for coupling, cohesion, and design patterns',
    inputSchema: z.object({
      path: z.string(),
      includeTests: z.boolean().default(false),
      generateDiagram: z.boolean().default(true),
      diagramType: z.enum(['mermaid', 'plantuml', 'graphviz']).default('mermaid'),
      focus: z.array(z.enum(['coupling', 'cohesion', 'complexity', 'layers', 'modules'])).default(['coupling', 'cohesion'])
    }),
    outputSchema: ArchitectureResponse,
    handler: async (params) => {
      const { generateDiagram, diagramType } = params;
      // Implementation would analyze architecture
      return {
        success: true,
        data: {
          score: 85,
          grade: 'B',
          issues: [],
          recommendations: [],
          diagram: generateDiagram ? `graph TD\n    A[Component] --> B[Component]` : undefined
        }
      };
    },
    tags: ['analysis', 'architecture']
  }),

  /**
   * Analyze dependencies
   */
  createTool({
    name: 'analyze_dependencies',
    description: 'Analyze project dependencies for vulnerabilities, licenses, and outdated packages',
    inputSchema: z.object({
      path: z.string(),
      checkVulnerabilities: z.boolean().default(true),
      checkLicenses: z.boolean().default(true),
      checkOutdated: z.boolean().default(true),
      severity: z.array(SeverityLevel).default(['medium', 'high', 'critical'])
    }),
    outputSchema: DependenciesResponse,
    handler: async (params) => {
      // Implementation would analyze dependencies
      return {
        success: true,
        data: {
          direct: [],
          transitive: [],
          vulnerabilities: [],
          licenses: {}
        }
      };
    },
    tags: ['analysis', 'dependencies', 'security']
  }),

  /**
   * Analyze performance
   */
  createTool({
    name: 'analyze_performance',
    description: 'Analyze code for performance bottlenecks, memory leaks, and optimization opportunities',
    inputSchema: z.object({
      path: z.string(),
      type: z.enum(['static', 'profile', 'benchmark']).default('static'),
      metrics: z.array(z.enum(['cpu', 'memory', 'io', 'network', 'render'])).default(['cpu', 'memory']),
      baseline: z.string().optional() // Path to baseline results for comparison
    }),
    outputSchema: PerformanceResponse,
    handler: async (params) => {
      // Implementation would analyze performance
      return {
        success: true,
        data: {
          metrics: [],
          bottlenecks: [],
          trends: []
        }
      };
    },
    tags: ['analysis', 'performance']
  }),

  /**
   * Analyze security
   */
  createTool({
    name: 'analyze_security',
    description: 'Perform security analysis to detect vulnerabilities, secrets, and security anti-patterns',
    inputSchema: z.object({
      path: z.string(),
      checks: z.array(z.enum(['vulnerabilities', 'secrets', 'config', 'dependencies', 'auth', 'injection'])).default(['vulnerabilities', 'secrets']),
      severity: z.array(SeverityLevel).default(['medium', 'high', 'critical']),
      includeTests: z.boolean().default(false)
    }),
    outputSchema: SecurityResponse,
    handler: async (params) => {
      // Implementation would run security analysis
      return {
        success: true,
        data: {
          score: 100,
          criticalIssues: 0,
          highIssues: 0,
          mediumIssues: 0,
          lowIssues: 0,
          issues: [],
          secrets: []
        }
      };
    },
    tags: ['analysis', 'security']
  }),

  /**
   * Analyze patterns
   */
  createTool({
    name: 'analyze_patterns',
    description: 'Detect code patterns, anti-patterns, and suggest refactoring opportunities',
    inputSchema: z.object({
      path: z.string(),
      patterns: z.array(z.enum(['design', 'anti', 'idiom', 'refactoring'])).default(['design', 'anti']),
      languages: z.array(z.string()).optional(),
      minConfidence: z.number().min(0).max(1).default(0.7)
    }),
    outputSchema: PatternsResponse,
    handler: async (params) => {
      // Implementation would detect patterns
      return {
        success: true,
        data: {
          patterns: [],
          suggestions: []
        }
      };
    },
    tags: ['analysis', 'patterns']
  }),

  /**
   * Analyze diff
   */
  createTool({
    name: 'analyze_diff',
    description: 'Analyze code changes (diff) for quality, risk, and impact assessment',
    inputSchema: z.object({
      base: z.string(), // Base ref (commit, branch, tag)
      head: z.string(), // Head ref
      path: z.string().optional(),
      includeCoverage: z.boolean().default(true),
      riskThreshold: z.enum(['low', 'medium', 'high']).default('medium')
    }),
    outputSchema: DiffAnalysisResponse,
    handler: async (params) => {
      // Implementation would analyze diff
      return {
        success: true,
        data: {
          summary: {
            filesChanged: 0,
            additions: 0,
            deletions: 0
          },
          changes: [],
          risk: {
            level: 'low',
            factors: []
          }
        }
      };
    },
    tags: ['analysis', 'diff', 'changes']
  }),

  /**
   * Analyze coverage
   */
  createTool({
    name: 'analyze_coverage',
    description: 'Analyze test coverage data and identify uncovered code paths',
    inputSchema: z.object({
      path: z.string(),
      reports: z.array(z.string()).optional(), // Paths to coverage reports
      threshold: z.number().min(0).max(100).default(80),
      format: z.enum(['lcov', 'cobertura', 'jacoco', 'json']).default('lcov')
    }),
    outputSchema: CoverageResponse,
    handler: async (params) => {
      // Implementation would analyze coverage
      return {
        success: true,
        data: {
          overall: {
            lines: 0,
            functions: 0,
            branches: 0
          },
          files: [],
          uncovered: []
        }
      };
    },
    tags: ['analysis', 'coverage', 'testing']
  }),

  /**
   * Generate report
   */
  createTool({
    name: 'generate_report',
    description: 'Generate comprehensive analysis report in multiple formats',
    inputSchema: z.object({
      analyses: z.array(z.enum(['code', 'architecture', 'dependencies', 'performance', 'security', 'coverage'])).default(['code']),
      format: z.enum(['html', 'pdf', 'markdown', 'json']).default('html'),
      output: z.string().optional(),
      includeHistory: z.boolean().default(false),
      branding: z.object({
        title: z.string().optional(),
        logo: z.string().optional(),
        colors: z.object({
          primary: z.string().optional(),
          secondary: z.string().optional()
        }).optional()
      }).optional()
    }),
    outputSchema: ReportResponse,
    handler: async (params) => {
      const { format } = params;
      const reportId = `report_${Date.now()}`;
      // Implementation would generate report
      return {
        success: true,
        data: {
          reportId,
          format,
          url: `/reports/${reportId}.${format}`,
          summary: `Analysis report generated in ${format} format`
        }
      };
    },
    tags: ['analysis', 'report', 'export']
  }),

  /**
   * RAG analysis
   */
  createTool({
    name: 'analyze_rag',
    description: 'Perform RAG (Retrieval-Augmented Generation) analysis on codebase',
    inputSchema: z.object({
      query: z.string(),
      path: z.string(),
      contextSize: z.number().int().min(1).max(20).default(5),
      similarity: z.object({
        minScore: z.number().min(0).max(1).default(0.7),
        maxResults: z.number().int().min(1).max(50).default(10)
      }).default({}),
      includeCode: z.boolean().default(true)
    }),
    outputSchema: RagAnalysisResponse,
    handler: async (params) => {
      const { query } = params;
      // Implementation would perform RAG analysis
      return {
        success: true,
        data: {
          query,
          sources: [],
          answer: 'RAG analysis would be performed here',
          confidence: 0.8
        }
      };
    },
    tags: ['analysis', 'rag', 'ai']
  })
];

export default analysisTools;
