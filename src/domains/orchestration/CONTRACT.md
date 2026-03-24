# Orchestration Domain Contract

## Overview
The Orchestration Domain manages tool registration, pipeline creation, and execution flow for complex workflows.

## Classes

### Orchestrator

Main class for managing tools and executing pipelines.

#### Methods

##### `registerTool(name, handler, config)`
Registers a new tool with the orchestrator.

**Parameters:**
- `name` (string): Unique tool identifier
- `handler` (Function): Tool handler function `(input, context) => output`
- `config` (ToolConfig, optional): Tool configuration

**ToolConfig Properties:**
- `timeout` (number): Execution timeout in ms (default: 30000)
- `retries` (number): Retry attempts (default: 0)
- `cache` (boolean): Enable result caching (default: false)
- `dependsOn` (string[]): Tool dependencies (default: [])

**Returns:** (Orchestrator) This instance for chaining

**Throws:**
- Error if name is invalid
- Error if handler is not a function
- Error if tool already registered

---

##### `createPipeline(tools)`
Creates a pipeline from tool names.

**Parameters:**
- `tools` (string[]): Array of registered tool names

**Returns:** (PipelineStep[]) Pipeline definition

**PipelineStep Object:**
- `name` (string): Tool name
- `config` (ToolConfig, optional): Override config

**Throws:**
- Error if tools is not an array
- Error if any tool is not registered

---

##### `executePipeline(pipeline, input)`
Executes a pipeline with initial input.

**Parameters:**
- `pipeline` (PipelineStep[]): Pipeline definition
- `input` (any): Initial input data

**Returns:** (Promise<PipelineResult>)
- `success` (boolean): Execution success
- `output` (any): Final output
- `steps` (Object): Step-by-step results
- `duration` (number): Execution time in ms

**Step Result Object:**
- `input`: Step input
- `output`: Step output
- `duration`: Step execution time

---

##### `parallel(tools)`
Creates a parallel execution configuration.

**Parameters:**
- `tools` (string[]): Tool names to execute in parallel

**Returns:** (Function) Async executor function that takes input and returns parallel results

**Parallel Result Object:**
- `parallel` (boolean): Always true
- `tools` (string[]): Tool names
- `results` (Array): Array of {tool, result} objects

**Throws:**
- Error if tools is not an array

---

##### `sequence(tools)`
Creates a sequential execution configuration.

**Parameters:**
- `tools` (string[]): Tool names to execute sequentially

**Returns:** (Function) Async executor function that takes input and returns pipeline result

**Throws:**
- Error if tools is not an array

---

##### `listTools()`
Lists all registered tools.

**Returns:** (string[]) Array of tool names

---

##### `unregisterTool(name)`
Unregisters a tool.

**Parameters:**
- `name` (string): Tool name

**Returns:** (boolean) True if removed

---

##### `clearCache()`
Clears the result cache.

## Usage Example

```javascript
import { Orchestrator } from './index.js';

const orchestrator = new Orchestrator();

// Register tools
orchestrator
  .registerTool('fetch', async (url) => fetch(url).then(r => r.json()))
  .registerTool('transform', (data) => data.map(x => x * 2))
  .registerTool('save', async (data) => { /* save logic */ return 'saved'; });

// Create and execute pipeline
const pipeline = orchestrator.createPipeline(['fetch', 'transform', 'save']);
const result = await orchestrator.executePipeline(pipeline, 'https://api.example.com/data');

// Parallel execution
const parallel = orchestrator.parallel(['fetch', 'fetch']);
const parallelResult = await parallel(['url1', 'url2']);

// Sequential execution
const sequence = orchestrator.sequence(['fetch', 'transform']);
const seqResult = await sequence('https://api.example.com/data');
```
