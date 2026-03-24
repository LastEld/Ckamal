/**
 * Tests for Claude Desktop Client
 * Anthropic Opus 4.6 Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeDesktopClient } from '../../src/clients/claude/desktop.js';

// Mock WebSocket
vi.mock('ws', () => {
  return {
    WebSocket: class MockWebSocket {
      constructor(url, options) {
        this.url = url;
        this.options = options;
        this.readyState = 0;
        
        // Simulate connection
        setTimeout(() => {
          this.readyState = 1;
          if (this.onopen) this.onopen();
        }, 10);
      }

      send(data) {
        // Echo back for testing
        setTimeout(() => {
          const parsed = JSON.parse(data);
          if (this.onmessage) {
            this.onmessage(Buffer.from(JSON.stringify({
              ...parsed,
              content: 'Test response',
              status: 'success'
            })));
          }
        }, 10);
      }

      close() {
        this.readyState = 3;
        if (this.onclose) this.onclose();
      }

      terminate() {
        this.close();
      }

      pong() {}
    }
  };
});

// Mock http
vi.mock('http', () => {
  return {
    default: {
      get: (url, callback) => {
        const res = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === 'data') {
              handler(JSON.stringify({ status: 'healthy', version: '4.6.0' }));
            } else if (event === 'end') {
              handler();
            }
          }
        };
        setTimeout(() => callback(res), 10);
        return {
          on: vi.fn(),
          setTimeout: vi.fn(),
          destroy: vi.fn()
        };
      },
      request: (options, callback) => {
        const res = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === 'data') {
              if (options.path === '/auth/session') {
                handler(JSON.stringify({ 
                  sessionId: 'test-session-123',
                  token: 'test-token-456'
                }));
              } else if (options.path === '/conversations') {
                handler(JSON.stringify({ 
                  conversationId: 'test-conv-789'
                }));
              }
            } else if (event === 'end') {
              handler();
            }
          }
        };
        
        return {
          on: vi.fn(),
          setTimeout: vi.fn(),
          destroy: vi.fn(),
          write: vi.fn(),
          end: () => setTimeout(() => callback(res), 10)
        };
      }
    }
  };
});

describe('ClaudeDesktopClient', () => {
  let client;

  beforeEach(() => {
    client = new ClaudeDesktopClient({
      apiHost: 'localhost',
      apiPort: 3456,
      autoReconnect: false
    });
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('Initialization', () => {
    it('should create client with correct configuration', () => {
      expect(client.provider).toBe('claude');
      expect(client.mode).toBe('desktop');
      expect(client.apiHost).toBe('localhost');
      expect(client.apiPort).toBe(3456);
      expect(client.maxContextTokens).toBe(1000000);
    });

    it('should initialize successfully', async () => {
      await client.initialize();
      expect(client.isConnected()).toBe(true);
      expect(client.status).toBe('ready');
    });

    it('should get capabilities', async () => {
      await client.initialize();
      const capabilities = client.getCapabilities();
      
      expect(capabilities.provider).toBe('claude');
      expect(capabilities.mode).toBe('desktop');
      expect(capabilities.model).toBe('claude-opus-4-6');
      expect(capabilities.contextWindow).toBe(1000000);
      expect(capabilities.maxOutputTokens).toBe(8192);
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.supportsFiles).toBe(true);
    });
  });

  describe('Messaging', () => {
    it('should send message', async () => {
      await client.initialize();
      
      const response = await client.send({
        content: 'Hello, test message'
      });

      expect(response).toBeDefined();
    });

    it('should throw error when not connected', async () => {
      await expect(client.send({ content: 'test' }))
        .rejects
        .toThrow('Claude Desktop client not connected');
    });
  });

  describe('Task Execution', () => {
    it('should execute task', async () => {
      await client.initialize();
      
      const result = await client.execute({
        type: 'test',
        description: 'Test task'
      });

      expect(result).toBeDefined();
    });

    it('should execute coding tasks', async () => {
      await client.initialize();

      // Test code completion prompt generation
      const prompt = client._buildCodeCompletionPrompt({
        code: 'function test() {\n  // cursor\n}',
        language: 'javascript',
        cursorPosition: 20
      });
      
      expect(prompt).toContain('javascript');
      expect(prompt).toContain('function test()');

      // Test code review prompt generation
      const reviewPrompt = client._buildCodeReviewPrompt({
        code: 'const x = 1;',
        language: 'javascript',
        focusAreas: ['performance', 'security']
      });
      
      expect(reviewPrompt).toContain('performance');
      expect(reviewPrompt).toContain('security');
    });
  });

  describe('File Operations', () => {
    it('should get file type', async () => {
      await client.initialize();
      
      expect(client._getFileType('test.js')).toBe('application/javascript');
      expect(client._getFileType('test.py')).toBe('text/x-python');
      expect(client._getFileType('test.json')).toBe('application/json');
      expect(client._getFileType('test.pdf')).toBe('application/pdf');
      expect(client._getFileType('test.unknown')).toBe('application/octet-stream');
    });
  });

  describe('Context Management', () => {
    it('should track context usage', async () => {
      await client.initialize();
      
      const usage = client.getContextUsage();
      
      expect(usage.maxTokens).toBe(1000000);
      expect(usage.usedTokens).toBe(0);
      expect(usage.availableTokens).toBe(1000000);
    });

    it('should manage message history', async () => {
      await client.initialize();
      
      // Add messages to history
      client._addToHistory({ role: 'user', content: 'Hello' });
      client._addToHistory({ role: 'assistant', content: 'Hi!' });
      
      const history = client.getLocalHistory();
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });

    it('should clear local history', async () => {
      await client.initialize();
      
      client._addToHistory({ role: 'user', content: 'Test' });
      expect(client.getLocalHistory()).toHaveLength(1);
      
      await client.clearHistory(false);
      expect(client.getLocalHistory()).toHaveLength(0);
    });
  });

  describe('Health Monitoring', () => {
    it('should ping successfully', async () => {
      await client.initialize();
      
      const latency = await client.ping();
      expect(latency).toBeDefined();
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('should return status', async () => {
      await client.initialize();
      
      const status = client.getStatus();
      expect(status.id).toBeDefined();
      expect(status.name).toBe('claude-desktop-opus46');
      expect(status.provider).toBe('claude');
      expect(status.status).toBe('ready');
    });
  });

  describe('Coding Capabilities', () => {
    it('should have coding capabilities defined', async () => {
      await client.initialize();
      
      const capabilities = client.getCapabilities();
      expect(capabilities.codingCapabilities).toBeDefined();
      expect(capabilities.codingCapabilities.codeCompletion).toBe(true);
      expect(capabilities.codingCapabilities.codeReview).toBe(true);
      expect(capabilities.codingCapabilities.refactoring).toBe(true);
      expect(capabilities.codingCapabilities.debugAssistance).toBe(true);
      expect(capabilities.codingCapabilities.architectureDesign).toBe(true);
    });

    it('should include coding features in capabilities', async () => {
      await client.initialize();
      
      const capabilities = client.getCapabilities();
      expect(capabilities.features).toContain('code_completion');
      expect(capabilities.features).toContain('code_review');
      expect(capabilities.features).toContain('refactoring');
      expect(capabilities.features).toContain('debug_assistance');
      expect(capabilities.features).toContain('architecture_design');
    });
  });

  describe('Message Formatting', () => {
    it('should format messages', async () => {
      await client.initialize();
      
      const formatted = client.formatMessage({
        content: 'Test message',
        metadata: { key: 'value' }
      });

      expect(formatted.content).toBe('Test message');
      expect(formatted.metadata).toEqual({ key: 'value' });
    });

    it('should parse responses', async () => {
      await client.initialize();
      
      const parsed = client.parseResponse({
        content: 'Response content',
        model: 'claude-opus-4-6',
        tokens: 100
      });

      expect(parsed.content).toBe('Response content');
      expect(parsed.metadata.model).toBe('claude-opus-4-6');
      expect(parsed.metadata.tokens).toBe(100);
    });
  });

  describe('Event Emission', () => {
    it('should emit ready event', async () => {
      const readyHandler = vi.fn();
      client.on('ready', readyHandler);
      
      await client.initialize();
      
      expect(readyHandler).toHaveBeenCalled();
    });

    it('should emit health events', async () => {
      await client.initialize();
      
      const healthHandler = vi.fn();
      client.on('health', healthHandler);
      
      client.updateHealth({ connected: true });
      
      expect(healthHandler).toHaveBeenCalled();
    });
  });

  describe('Reconnection', () => {
    it('should reconnect', async () => {
      await client.initialize();
      expect(client.isConnected()).toBe(true);
      
      await client.reconnect();
      expect(client.isConnected()).toBe(true);
    });
  });
});

describe('ClaudeDesktopClient Integration', () => {
  it('should support 1M context window', () => {
    const client = new ClaudeDesktopClient();
    expect(client.maxContextTokens).toBe(1000000);
  });

  it('should support all coding task types', () => {
    const client = new ClaudeDesktopClient();
    const caps = client.codingCapabilities;
    
    expect(caps.codeCompletion).toBe(true);
    expect(caps.codeReview).toBe(true);
    expect(caps.refactoring).toBe(true);
    expect(caps.debugAssistance).toBe(true);
    expect(caps.architectureDesign).toBe(true);
  });

  it('should configure auto-reconnect', () => {
    const client = new ClaudeDesktopClient({
      autoReconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10
    });
    
    expect(client.autoReconnect).toBe(true);
    expect(client.reconnectInterval).toBe(5000);
    expect(client.maxReconnectAttempts).toBe(10);
  });
});
