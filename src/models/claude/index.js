/**
 * @fileoverview Claude Opus 4.6 Integration Module
 * @module models/claude
 * 
 * Deep native integration with Claude Opus 4.6 providing:
 * - 1M token context window management
 * - Session-based authentication
 * - Streaming support
 * - Native protocol implementation
 * 
 * @example
 * import { createOpusClient, CodingTaskType } from './models/claude/index.js';
 * 
 * const client = createOpusClient({
 *   websocketUrl: 'ws://localhost:3456',
 *   config: { maxContextTokens: 1000000 }
 * });
 * 
 * await client.initialize();
 * 
 * const assistant = createOpusCodingAssistant(client);
 * const result = await assistant.architectureDesign({
 *   requirements: 'Build a scalable microservices platform'
 * });
 */

import * as OpusConfigModule from './opus-config.js';
import * as OpusSessionModule from './opus-session.js';
import * as OpusClientModule from './opus-client.js';
import * as OpusCodingModule from './opus-coding.js';

// Configuration
export { 
  OpusConfig, 
  createOpusConfig,
  OPUS_DEFAULTS,
  OpusConfigError 
} from './opus-config.js';

// Session Management
export { 
  OpusSession, 
  OpusSessionManager, 
  createSessionManager,
  SessionState,
  SessionError 
} from './opus-session.js';

// Client
export { 
  OpusClient, 
  createOpusClient,
  OpusClientError 
} from './opus-client.js';

// Coding Assistant
export { 
  OpusCodingAssistant, 
  createOpusCodingAssistant,
  CodingTaskType,
  CodingTaskError 
} from './opus-coding.js';

/**
 * Creates a fully configured Opus client with all components
 * @param {Object} options - Setup options
 * @param {string} [options.sessionToken] - Claude session token
 * @param {string} [options.websocketUrl] - WebSocket URL
 * @param {Object} [options.config] - Configuration options
 * @returns {Promise<Object>} Configured client and assistant
 */
export async function createOpusIntegration(options = {}) {
  const config = OpusConfigModule.createOpusConfig(options.config);
  const sessionManager = OpusSessionModule.createSessionManager(options.sessionManager);
  
  const client = OpusClientModule.createOpusClient({
    config,
    sessionManager,
    ...options,
  });
  
  const assistant = OpusCodingModule.createOpusCodingAssistant(client, {
    gitEnabled: options.gitEnabled ?? true,
    projectRoot: options.projectRoot,
  });
  
  return {
    client,
    assistant,
    config,
    sessionManager,
    
    /**
     * Initialize the integration
     * @param {Object} initOptions - Initialization options
     */
    async initialize(initOptions = {}) {
      await client.initialize({
        sessionToken: options.sessionToken,
        ...initOptions,
      });
      return this;
    },
    
    /**
     * Close the integration and cleanup
     */
    async close() {
      await client.close();
      await sessionManager.dispose();
    },
  };
}

/**
 * Module version
 * @constant {string}
 */
export const VERSION = '1.0.0';

/**
 * Module name
 * @constant {string}
 */
export const MODULE_NAME = 'claude-opus-4-6';

export default {
  createOpusConfig: OpusConfigModule.createOpusConfig,
  createSessionManager: OpusSessionModule.createSessionManager,
  createOpusClient: OpusClientModule.createOpusClient,
  createOpusCodingAssistant: OpusCodingModule.createOpusCodingAssistant,
  createOpusIntegration,
  VERSION,
  MODULE_NAME,
};
