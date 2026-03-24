/**
 * @fileoverview End-to-end tests for BIOS Console interactions
 * Tests CLI commands, interactive prompts, and console workflows
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';

describe('BIOS Console E2E Tests', () => {
  let server;
  let serverPort;

  before(async () => {
    server = await startTestServer({
      port: 0,
      enableConsole: true,
      environment: 'test'
    });
    serverPort = server.port;
  });

  after(async () => {
    await stopTestServer(server);
  });

  describe('Basic CLI Commands', () => {
    it('should display help information', async () => {
      // Arrange
      const cli = spawn('node', ['src/cli/bios-console.js', '--help'], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        cli.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        cli.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        cli.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`CLI exited with code ${code}: ${stderr}`));
          }
        });
      });

      // Assert
      assert.ok(output.includes('Usage:'));
      assert.ok(output.includes('Commands:'));
      assert.ok(output.includes('status'));
      assert.ok(output.includes('start'));
      assert.ok(output.includes('stop'));
    });

    it('should show system status', async () => {
      // Arrange
      const cli = spawn('node', ['src/cli/bios-console.js', 'status'], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('System Status:'));
      assert.ok(output.includes('Version:'));
      assert.ok(output.includes('Uptime:'));
      assert.ok(output.includes('Status:'));
    });

    it('should list loaded modules', async () => {
      // Arrange
      const cli = spawn('node', ['src/cli/bios-console.js', 'modules', 'list'], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Loaded Modules:'));
      assert.ok(output.includes('bios'));
      assert.ok(output.includes('orchestrator'));
    });
  });

  describe('Interactive Console Mode', () => {
    it('should process interactive commands', async () => {
      // Arrange
      const cli = spawn('node', ['src/cli/bios-console.js', '--interactive'], {
        env: { ...process.env, PORT: serverPort }
      });

      const outputs = [];

      cli.stdout.on('data', (data) => {
        outputs.push(data.toString());
      });

      // Act - Send commands
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          cli.stdin.write('status\n');
        }, 500);

        setTimeout(() => {
          cli.stdin.write('modules list\n');
        }, 1000);

        setTimeout(() => {
          cli.stdin.write('exit\n');
        }, 1500);

        cli.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Exit code: ${code}`));
        });

        setTimeout(reject, 5000);
      });

      // Assert
      const output = outputs.join('');
      assert.ok(output.includes('bios-console'));
      assert.ok(output.includes('Status:') || output.includes('Modules:'));
    });
  });

  describe('Module Management', () => {
    it('should load a module dynamically', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'modules',
        'load',
        'test-module'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Module loaded:') || output.includes('already loaded'));
    });

    it('should unload a module', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'modules',
        'unload',
        'test-module'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Module unloaded:') || output.includes('not loaded'));
    });
  });

  describe('Task Management via Console', () => {
    it('should list active tasks', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'tasks',
        'list'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Active Tasks:') || output.includes('No active tasks'));
    });

    it('should cancel a task', async () => {
      // Arrange - First create a long-running task
      const http = await import('http');
      const taskReq = JSON.stringify({
        type: 'long-running-test',
        priority: 1
      });

      const createRes = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: serverPort,
          path: '/api/v1/tasks',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': taskReq.length
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(taskReq);
        req.end();
      });

      const taskId = createRes.taskId;

      // Act - Cancel via CLI
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'tasks',
        'cancel',
        taskId
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Task cancelled:') || output.includes('not found'));
    });
  });

  describe('Configuration Management', () => {
    it('should show current configuration', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'config',
        'show'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Configuration:'));
      assert.ok(output.includes('bios') || output.includes('version'));
    });

    it('should update configuration value', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'config',
        'set',
        'test.value',
        'test123'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Configuration updated:') || output.includes('set to'));
    });
  });

  describe('Logging and Diagnostics', () => {
    it('should display recent logs', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'logs',
        '--lines',
        '20'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Recent Logs:') || output.length > 0);
    });

    it('should run health diagnostics', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'health',
        '--diagnose'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Health Check:') || output.includes('Diagnostics:'));
      assert.ok(output.includes('healthy') || output.includes('degraded') || output.includes('unhealthy'));
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid commands gracefully', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'invalid-command'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const result = await new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.stderr.on('data', (data) => { stderr += data.toString(); });
        cli.on('close', (code) => {
          resolve({ code, stdout, stderr });
        });
      });

      // Assert
      assert.ok(result.code !== 0 || result.stdout.includes('Unknown command') || result.stderr.includes('Unknown'));
    });

    it('should handle connection errors', async () => {
      // Arrange - Use invalid port
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'status'
      ], {
        env: { ...process.env, PORT: '99999' } // Invalid port
      });

      // Act
      const result = await new Promise((resolve) => {
        let stderr = '';
        cli.stderr.on('data', (data) => { stderr += data.toString(); });
        cli.on('close', (code) => {
          resolve({ code, stderr });
        });
      });

      // Assert
      assert.ok(result.code !== 0 || result.stderr.includes('connect') || result.stderr.includes('ECONNREFUSED'));
    });
  });

  describe('System Control', () => {
    it('should restart system gracefully', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'system',
        'restart',
        '--graceful'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('restarting') || output.includes('restart'));
    });

    it('should show system metrics', async () => {
      // Arrange
      const cli = spawn('node', [
        'src/cli/bios-console.js',
        'system',
        'metrics'
      ], {
        env: { ...process.env, PORT: serverPort }
      });

      // Act
      const output = await new Promise((resolve, reject) => {
        let stdout = '';
        cli.stdout.on('data', (data) => { stdout += data.toString(); });
        cli.on('close', (code) => {
          code === 0 ? resolve(stdout) : reject(new Error(`Exit code: ${code}`));
        });
      });

      // Assert
      assert.ok(output.includes('Memory:') || output.includes('CPU:') || output.includes('metrics'));
    });
  });
});
