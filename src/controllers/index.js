/**
 * @fileoverview Controllers Module Index
 * Unified and autonomous controllers for CogniMesh
 */

// Unified Controller
export { 
  UnifiedController, 
  ToolExecutionError, 
  ValidationError 
} from './unified.js';

// Unified Handlers
export { SystemToolsHandler } from './unified/handlers/system.js';
export { WorkflowToolsHandler, WorkflowStatus } from './unified/handlers/workflow.js';
export { ProjectAdminToolsHandler, ProjectStatus } from './unified/handlers/project-admin.js';
export { 
  IntegrationsToolsHandler, 
  WebhookEvents, 
  NotificationChannels 
} from './unified/handlers/integrations.js';
export { 
  TransferToolsHandler, 
  ExportFormats, 
  ImportSources,
  TransferStatus 
} from './unified/handlers/transfer.js';
export { 
  OrchestrationToolsHandler, 
  ScheduleTypes, 
  RoutingStrategies 
} from './unified/handlers/orchestration.js';

// Autonomous Controller
export { 
  AutonomousController, 
  AutonomousExecutionError,
  ExecutionResult,
  ExecutionStatus 
} from './autonomous.js';

// Autonomous Components
export { 
  IntentParser, 
  IntentTypes, 
  EntityTypes,
  IntentResult 
} from './autonomous/intents.js';
export { 
  StatePersistence, 
  Checkpoint 
} from './autonomous/persistence.js';

// Task Controller
export {
  TaskController,
  TaskPriority,
  TaskStatus,
  createTaskController
} from './tasks.js';

// Roadmap Controller
export {
  RoadmapController,
  NodeStatus,
  LearningPace,
  createRoadmapController
} from './roadmaps.js';

// Claude Controllers
export {
  ClaudeCoreController,
  ClaudeModel,
  createClaudeCoreController
} from './claude-core.js';

export {
  ClaudeVisionController,
  AnalysisType,
  ImageFormat,
  createClaudeVisionController
} from './claude-vision.js';

export {
  ClaudeContextController,
  WindowStrategy,
  CompressionLevel,
  createClaudeContextController
} from './claude-context.js';

export {
  ClaudeConversationController,
  MessageRole,
  createClaudeConversationController
} from './claude-conversation.js';

export {
  ClaudeTokensController,
  BudgetType,
  TruncationStrategy,
  AlertLevel,
  createClaudeTokensController
} from './claude-tokens.js';

export {
  ClaudeStreamingController,
  StreamStatus,
  StreamType,
  StreamPriority,
  createClaudeStreamingController
} from './claude-streaming.js';

export {
  ClaudeBatchController,
  BatchStatus,
  createClaudeBatchController
} from './claude-batch.js';

export {
  ClaudeExtendedThinkingController,
  ThinkingStatus,
  BUDGET_CONSTRAINTS,
  SUPPORTED_MODELS,
  createClaudeExtendedThinkingController
} from './claude-extended-thinking.js';

// Helpers
export {
  // Validation & Formatting
  validateRequest,
  validateInput,
  formatResponse,
  formatListResponse,
  formatError,
  
  // Error Handling
  handleError,
  withErrorHandling,
  handleAsync,
  createControllerMethod,
  
  // Utilities
  generateId,
  pick,
  omit,
  deepMerge,
  parseFilters,
  parsePagination,
  sortBy,
  paginateResults
} from './helpers.js';
