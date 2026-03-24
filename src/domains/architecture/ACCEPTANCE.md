# Architecture Domain Acceptance Criteria

## Functional Requirements

- FR1: System shall analyze project structure and detect architectural patterns
- FR2: System shall identify layered, modular, and microservices architectures
- FR3: System shall generate actionable recommendations based on analysis
- FR4: System shall validate architecture against configurable rules
- FR5: System shall support custom file discovery with exclusion patterns
- FR6: System shall emit events for analysis lifecycle (start, complete, error)
- FR7: System shall store and retrieve multiple analysis results
- FR8: System shall calculate confidence scores for detected patterns

## Test Scenarios

### Scenario 1: Project Analysis
- Given: A valid project path with source files
- When: analyzeProject() is called with the path
- Then: The system discovers all supported files (.js, .ts, .jsx, .tsx, .json, .md)
- And: The system excludes node_modules, .git, dist, and build directories
- And: The analysis includes timestamp, patterns, recommendations, and validations
- And: Events 'analysisStarted' and 'analysisComplete' are emitted

### Scenario 2: Pattern Detection
- Given: A project with controllers, services, and repositories folders
- When: detectPatterns() is called with discovered files
- Then: LayeredArchitecture pattern is detected with confidence > 0.6
- And: Detected layers include controllers, services, repositories, models
- And: Pattern metadata includes matched files and layer information

### Scenario 3: Modular Architecture Detection
- Given: A project with module folders containing matching .js/.ts files
- When: detectPatterns() analyzes the file structure
- Then: ModularArchitecture pattern is detected when 2+ modules found
- And: Each module is identified by folder/name matching filename pattern
- And: Confidence score scales with number of modules (min 2, max confidence at 5+)

### Scenario 4: Microservices Pattern Detection
- Given: A project with multiple service directories containing package.json
- When: detectPatterns() processes the project files
- Then: MicroservicesPattern is detected with individual service identification
- And: Services are identified from service/api/microservices folder patterns
- And: docker-compose or k8s files trigger detection even with single service

### Scenario 5: Recommendation Generation
- Given: An analyzed project with detected patterns and files
- When: generateRecommendations() is called
- Then: Warning is generated if test coverage < 10% (test file ratio)
- And: Info recommendation is generated if no README.md found
- And: Warning is generated if < 2 configuration files present
- And: Warning is generated if no clear pattern detected in projects > 20 files

### Scenario 6: Architecture Validation
- Given: A set of validation rules (file-count, naming, dependency)
- When: validateArchitecture() is executed
- Then: File-count rules enforce maximum file limits
- And: Naming rules validate files against regex patterns
- And: Each validation returns passed status, message, and optional details
- And: Events 'validationComplete' is emitted with overall pass/fail status

### Scenario 7: Analysis Error Handling
- Given: An invalid or inaccessible project path
- When: analyzeProject() is called
- Then: Error is thrown with descriptive message
- And: 'analysisError' event is emitted with error details
- And: No partial analysis is stored

### Scenario 8: Pattern Confidence Calculation
- Given: Various project structures with different layer counts
- When: Layered architecture detection runs
- Then: Confidence = min(layerCount / 3, 1.0)
- And: Detection requires minimum 2 layers to be considered valid
- And: Confidence is included in pattern metadata

## Performance Requirements

- PR1: Analysis of 1000 files completes in < 5 seconds
- PR2: Pattern detection scales linearly with file count O(n)
- PR3: Memory usage remains under 500MB for large projects (10k+ files)
- PR4: File discovery excludes patterns early to minimize I/O
- PR5: Multiple analyses can be stored without significant memory overhead

## Security Requirements

- SR1: Path traversal attempts in projectPath are rejected or sanitized
- SR2: Excluded directories (node_modules) are never accessed
- SR3: Analysis results do not expose sensitive file contents
- SR4: File permissions are respected during directory traversal
- SR5: No code execution occurs during static analysis
