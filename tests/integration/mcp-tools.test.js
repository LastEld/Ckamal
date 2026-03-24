/**
 * @fileoverview Integration tests for MCP (Model Context Protocol) Tools
 * Tests tool discovery, execution, and error handling
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createTestClient } from '../helpers/test-client.js';

describe('MCP Tools Integration Tests', () => {
  let server;
  let client;

  before(async () => {
    server = await startTestServer({
      port: 0,
      enableMCP: true,
      environment: 'test'
    });
    client = createTestClient(`http://localhost:${server.port}`);
  });

  after(async () => {
    await stopTestServer(server);
  });

  describe('Tool Discovery', () => {
    it('should list all available tools', async () => {
      // Act
      const response = await client.get('/mcp/v1/tools');

      // Assert
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.data.tools));
      assert.ok(response.data.tools.length > 0);
      
      // Each tool should have required fields
      response.data.tools.forEach(tool => {
        assert.ok(tool.name, 'Tool should have name');
        assert.ok(tool.description, 'Tool should have description');
        assert.ok(tool.inputSchema, 'Tool should have input schema');
      });
    });

    it('should get specific tool details', async () => {
      // Act
      const response = await client.get('/mcp/v1/tools/file-read');

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.name, 'file-read');
      assert.ok(response.data.description);
      assert.ok(response.data.inputSchema);
      assert.ok(response.data.outputSchema);
    });

    it('should return 404 for unknown tools', async () => {
      // Act
      const response = await client.get('/mcp/v1/tools/non-existent-tool');

      // Assert
      assert.equal(response.status, 404);
      assert.ok(response.data.message.includes('not found'));
    });

    it('should filter tools by capability', async () => {
      // Act
      const response = await client.get('/mcp/v1/tools?capability=file');

      // Assert
      assert.equal(response.status, 200);
      assert.ok(response.data.tools.every(t => 
        t.capabilities?.includes('file') || t.name.includes('file')
      ));
    });
  });

  describe('Tool Execution', () => {
    it('should execute file-read tool', async () => {
      // Arrange
      const request = {
        tool: 'file-read',
        params: {
          path: '/test/file.txt'
        }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.ok(response.data.content);
      assert.ok(response.data.metadata);
    });

    it('should execute file-write tool', async () => {
      // Arrange
      const request = {
        tool: 'file-write',
        params: {
          path: '/test/output.txt',
          content: 'Hello, World!'
        }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.success, true);
      assert.ok(response.data.bytesWritten);
    });

    it('should execute command tool', async () => {
      // Arrange
      const request = {
        tool: 'command-exec',
        params: {
          command: 'echo',
          args: ['hello']
        }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.ok(response.data.stdout);
      assert.equal(response.data.exitCode, 0);
    });

    it('should handle tool execution errors', async () => {
      // Arrange
      const request = {
        tool: 'file-read',
        params: {
          path: '/non-existent/path'
        }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200); // MCP returns 200 with error in body
      assert.equal(response.data.isError, true);
      assert.ok(response.data.error);
      assert.ok(response.data.error.message);
    });

    it('should validate tool parameters', async () => {
      // Arrange - missing required 'path' parameter
      const request = {
        tool: 'file-read',
        params: {}
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 400);
      assert.ok(response.data.errors);
      assert.ok(response.data.errors.some(e => e.includes('path')));
    });

    it('should support async tool execution', async () => {
      // Arrange
      const request = {
        tool: 'long-running-task',
        params: {
          duration: 5000
        },
        async: true
      };

      // Act - Start async execution
      const startResponse = await client.post('/mcp/v1/execute', request);
      const jobId = startResponse.data.jobId;

      // Poll for completion
      let result;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await client.get(`/mcp/v1/jobs/${jobId}`);
        if (statusRes.data.status === 'completed') {
          result = statusRes.data.result;
          break;
        }
      }

      // Assert
      assert.ok(jobId);
      assert.ok(result);
      assert.equal(result.status, 'success');
    });

    it('should cancel async tool execution', async () => {
      // Arrange
      const request = {
        tool: 'long-running-task',
        params: { duration: 30000 },
        async: true
      };

      const startResponse = await client.post('/mcp/v1/execute', request);
      const jobId = startResponse.data.jobId;

      // Act
      const cancelResponse = await client.post(`/mcp/v1/jobs/${jobId}/cancel`);

      // Assert
      assert.equal(cancelResponse.status, 200);
      assert.equal(cancelResponse.data.status, 'cancelled');

      // Verify job is cancelled
      const statusRes = await client.get(`/mcp/v1/jobs/${jobId}`);
      assert.equal(statusRes.data.status, 'cancelled');
    });
  });

  describe('Tool Chaining', () => {
    it('should execute multiple tools in sequence', async () => {
      // Arrange
      const request = {
        pipeline: [
          {
            tool: 'file-read',
            params: { path: '/test/input.txt' },
            output: 'fileContent'
          },
          {
            tool: 'text-process',
            params: { 
              text: '${fileContent}',
              operation: 'uppercase'
            },
            output: 'processed'
          },
          {
            tool: 'file-write',
            params: {
              path: '/test/output.txt',
              content: '${processed}'
            }
          }
        ]
      };

      // Act
      const response = await client.post('/mcp/v1/pipeline', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.status, 'completed');
      assert.equal(response.data.steps.length, 3);
      assert.ok(response.data.results);
    });

    it('should handle pipeline failures', async () => {
      // Arrange - second step will fail
      const request = {
        pipeline: [
          { tool: 'file-read', params: { path: '/test/input.txt' } },
          { tool: 'invalid-tool', params: {} },
          { tool: 'file-write', params: { path: '/test/out.txt', content: 'x' } }
        ],
        onFailure: 'stop'
      };

      // Act
      const response = await client.post('/mcp/v1/pipeline', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.status, 'failed');
      assert.equal(response.data.failedAt, 1);
      assert.equal(response.data.results.length, 1); // Only first step completed
    });

    it('should support conditional pipeline steps', async () => {
      // Arrange
      const request = {
        pipeline: [
          { tool: 'check-condition', params: {}, output: 'condition' },
          {
            tool: 'conditional-step',
            params: { input: '${condition.value}' },
            condition: '${condition.value} > 10'
          }
        ]
      };

      // Act
      const response = await client.post('/mcp/v1/pipeline', request);

      // Assert
      assert.equal(response.status, 200);
      // Step 2 should be skipped if condition is false
    });
  });

  describe('Resource Management', () => {
    it('should list available resources', async () => {
      // Act
      const response = await client.get('/mcp/v1/resources');

      // Assert
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.data.resources));
    });

    it('should read resource content', async () => {
      // Act
      const response = await client.get('/mcp/v1/resources/test-resource');

      // Assert
      assert.equal(response.status, 200);
      assert.ok(response.data.content);
      assert.ok(response.data.mimeType);
    });

    it('should subscribe to resource updates', async () => {
      // Arrange
      const updates = [];
      const ws = new WebSocket(`ws://localhost:${server.port}/mcp/ws`);

      // Act
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            resource: 'test-resource'
          }));
        });

        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'resource:updated') {
            updates.push(msg);
            if (updates.length >= 1) {
              ws.close();
              resolve();
            }
          }
        });

        // Trigger resource update
        setTimeout(async () => {
          await client.post('/mcp/v1/resources/test-resource/notify');
        }, 500);

        setTimeout(reject, 5000);
      });

      // Assert
      assert.ok(updates.length >= 1);
    });
  });

  describe('Prompt Templates', () => {
    it('should list available prompts', async () => {
      // Act
      const response = await client.get('/mcp/v1/prompts');

      // Assert
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.data.prompts));
    });

    it('should get prompt template', async () => {
      // Act
      const response = await client.get('/mcp/v1/prompts/code-review');

      // Assert
      assert.equal(response.status, 200);
      assert.ok(response.data.template);
      assert.ok(response.data.arguments);
    });

    it('should render prompt with arguments', async () => {
      // Arrange
      const request = {
        name: 'code-review',
        arguments: {
          language: 'javascript',
          code: 'function test() {}'
        }
      };

      // Act
      const response = await client.post('/mcp/v1/prompts/render', request);

      // Assert
      assert.equal(response.status, 200);
      assert.ok(response.data.rendered);
      assert.ok(response.data.rendered.includes('javascript'));
    });
  });

  describe('Security & Permissions', () => {
    it('should enforce tool permissions', async () => {
      // Arrange - try to use admin tool with regular user
      const request = {
        tool: 'system-restart',
        params: {}
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request, {
        headers: { 'X-User-Role': 'user' }
      });

      // Assert
      assert.equal(response.status, 403);
      assert.ok(response.data.message.includes('permission'));
    });

    it('should sandbox command execution', async () => {
      // Arrange - try dangerous command
      const request = {
        tool: 'command-exec',
        params: {
          command: 'rm',
          args: ['-rf', '/']
        }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.isError, true);
      assert.ok(response.data.error.message.includes('forbidden'));
    });

    it('should rate limit tool execution', async () => {
      // Arrange
      const requests = Array.from({ length: 110 }, () =>
        client.post('/mcp/v1/execute', {
          tool: 'echo',
          params: { message: 'test' }
        })
      );

      // Act
      const responses = await Promise.all(requests);

      // Assert
      const rateLimited = responses.filter(r => r.status === 429);
      assert.ok(rateLimited.length > 0);
    });

    it('should validate file access permissions', async () => {
      // Arrange - try to access file outside allowed paths
      const request = {
        tool: 'file-read',
        params: {
          path: '/etc/passwd'
        }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.isError, true);
      assert.ok(response.data.error.message.includes('access denied'));
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', async () => {
      // Arrange
      const request = {
        tool: 'infinite-loop',
        params: {},
        timeout: 1000 // 1 second timeout
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.isError, true);
      assert.ok(response.data.error.message.includes('timeout'));
    });

    it('should handle tool crashes gracefully', async () => {
      // Arrange
      const request = {
        tool: 'crash-test',
        params: { cause: 'segfault' }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.isError, true);
      assert.ok(response.data.error);
      // Should not crash the server
    });

    it('should provide meaningful error messages', async () => {
      // Arrange
      const request = {
        tool: 'file-read',
        params: {
          path: '/invalid/path with /null/bytes\x00'
        }
      };

      // Act
      const response = await client.post('/mcp/v1/execute', request);

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.isError, true);
      assert.ok(response.data.error.message);
      assert.ok(response.data.error.code);
    });
  });
});
