# Claude Sonnet 4.6 CLI Integration

> **All models are accessed through flat-rate subscriptions. No API billing applies.**

## Overview

Full integration of Anthropic Claude Sonnet 4.6 with CogniMesh BIOS CLI.

## Files Created/Modified

### 1. `src/clients/claude/cli.js` (Updated)
- **BaseClient extension**: Full integration with base client
- **API + CLI support**: Support for both API and CLI modes
- **200K context window**: Full access to Sonnet 4.6 context
- **Coding workflows**:
  - `codeAnalyze(filePath)` - Code analysis
  - `codeGenerate(prompt, language)` - Code generation
  - `codeReview(filePath)` - Code review
  - `explainCode(filePath)` - Code explanation
  - `analyzeMultipleFiles(filePaths)` - Multi-file analysis
  - `generateDiff(original, modified)` - Diff generation
- **Project context**: Project context loading and usage
- **Interactive mode**: Interactive chat session
- **Batch processing**: Batch task processing
- **Git integration**: Automatic git diff detection
- **Language detection**: Auto-detection of 40+ programming languages

### 2. `src/bios/cli.js` (Updated)
Added commands:
```
bios claude chat              # Interactive chat
bios claude analyze <file>    # File analysis
bios claude generate <prompt> # Code generation
bios claude review <file>     # Code review
bios claude explain <file>    # Code explanation
bios claude batch --file <f>  # Batch processing
bios claude status            # Client status
```

### 3. `tests/clients/claude/cli.test.js` (Created)
- Unit tests for all client functions
- Tests for language detection
- Tests for project context
- Tests for code operations
- Tests for status management

### 4. `examples/claude-batch-tasks.json` (Created)
Example task file for batch processing.

### 5. `examples/claude-usage.md` (Created)
Usage documentation with examples.

## Features

### Interactive Mode
```bash
bios claude chat
```
- Conversation history
- Commands: `exit`, `clear`, `status`
- Streaming support (via API)

### Code Analysis
```bash
bios claude analyze src/app.js --focus "security,performance"
```
- Structure and purpose
- Key functions/classes
- Potential issues
- Performance considerations
- Security concerns

### Code Generation
```bash
bios claude generate "Create Redis cache wrapper" --language typescript
```
- Clean, documented code
- Error handling
- Type hints/annotations
- Example usage

### Code Review
```bash
bios claude review src/auth.js --strict
```
- Git diff integration
- Bugs and logical errors
- Security vulnerabilities
- Performance bottlenecks
- Code style violations

### Code Explanation
```bash
bios claude explain src/algorithm.js --level beginner
```
- Levels: beginner, intermediate, expert
- Answers to specific questions
- Line-by-line breakdown

### Batch Processing
```bash
bios claude batch --file tasks.json --concurrency 2
```
- Concurrent task execution
- Rate limit protection
- Progress reporting
- Error handling per task

## Configuration

### Access Model

Claude Sonnet 4.6 is accessed through a subscription-backed plan. No per-token or metered API billing is required.

### Constructor Options
```javascript
const client = new ClaudeCliClient({
  model: 'claude-sonnet-4-6',  // or 'claude-opus-4'
  preferApi: true,              // API vs CLI
  baseURL: 'https://api.anthropic.com/v1'
});
```

## Supported Models
- `claude-sonnet-4-6` (default)
- `claude-opus-4`
- `claude-haiku-3-5`

## Capabilities
```javascript
{
  provider: 'claude',
  mode: 'cli',
  contextWindow: 200000,
  features: [
    'code_analysis',
    'code_generation',
    'code_review',
    'code_explanation',
    'file_operations',
    'command_execution',
    'interactive_mode',
    'batch_processing',
    'multi_file_analysis',
    'git_integration',
    'diff_generation'
  ],
  streaming: true,
  supportsFiles: true,
  supportsImages: true,
  supportsSystemPrompts: true
}
```

## Testing
```bash
# Run tests
npm test tests/clients/claude/cli.test.js
```

## Integration Status
- ✅ CLI Client implemented
- ✅ BIOS CLI integration
- ✅ Coding workflows
- ✅ Project context
- ✅ Interactive mode
- ✅ Batch processing
- ✅ Git integration
- ✅ Tests created
- ✅ Documentation created
