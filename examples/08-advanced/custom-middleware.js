#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Custom Middleware Example
 * 
 * This example demonstrates creating and using custom middleware:
 * 1. Authentication middleware
 * 2. ACL (Access Control List) middleware
 * 3. Metrics middleware
 * 4. Audit middleware
 * 5. Circuit breaker middleware
 * 
 * @example
 *   node custom-middleware.js
 * 
 * @module examples/08-advanced/custom-middleware
 */

import { CogniMeshBIOS } from '../../src/bios/index.js';
import { CogniMeshServer } from '../../src/server.js';
import { 
  getAuthMiddleware, 
  AUTH_MODES,
  JWT_ALGORITHMS
} from '../../src/middleware/auth.js';
import { 
  getACL, 
  ROLE_HIERARCHY,
  createStandardACL
} from '../../src/middleware/acl.js';
import { 
  getMetricsMiddleware 
} from '../../src/middleware/metrics.js';
import { 
  getAuditMiddleware 
} from '../../src/middleware/audit.js';
import { 
  getCircuitBreaker,
  CircuitState
} from '../../src/middleware/circuit-breaker.js';

// ============================================================
// Custom Middleware Example
// ============================================================

console.log('[CogniMesh v5.0] Custom Middleware Example');
console.log('===========================================\n');

async function main() {
  const bios = new CogniMeshBIOS();
  await bios.boot();

  try {
    console.log('✅ BIOS booted\n');

    // ============================================================
    // Part 1: Authentication Middleware
    // ============================================================
    
    console.log('--- Authentication Middleware ---\n');
    
    // Get or create auth middleware
    const authMiddleware = getAuthMiddleware({
      mode: AUTH_MODES.JWT,
      secret: 'your-secret-key-here',
      algorithms: [JWT_ALGORITHMS.HS256],
      tokenExpiry: '24h'
    });
    
    console.log('JWT Config:');
    console.log(`  Mode: ${authMiddleware.config.mode}`);
    console.log(`  Algorithms: ${authMiddleware.config.algorithms.join(', ')}`);
    
    // Simulate token generation and verification
    const mockUser = {
      id: 'user-123',
      role: 'developer',
      permissions: ['read:tasks', 'write:tasks']
    };
    
    const token = authMiddleware.generateToken(mockUser);
    console.log(`\nGenerated token for user: ${mockUser.id}`);
    
    // Verify token
    try {
      const decoded = authMiddleware.verifyToken(token);
      console.log('Token verification: ✅');
      console.log(`  User: ${decoded.id}`);
      console.log(`  Role: ${decoded.role}`);
      console.log(`  Permissions: ${decoded.permissions.join(', ')}`);
    } catch (error) {
      console.log(`Token verification: ❌ ${error.message}`);
    }
    
    // Demonstrate authentication in request flow
    console.log('\n--- Request Authentication Flow ---\n');
    
    const mockRequest = {
      headers: { authorization: `Bearer ${token}` },
      path: '/api/tasks',
      method: 'GET'
    };
    
    const mockResponse = {
      statusCode: 200,
      json: (data) => console.log('Response:', JSON.stringify(data, null, 2))
    };
    
    const next = () => {
      console.log('✅ Request authenticated - proceeding to handler');
    };
    
    console.log('Request:', mockRequest.method, mockRequest.path);
    authMiddleware.middleware(mockRequest, mockResponse, next);

    // ============================================================
    // Part 2: ACL (Access Control List) Middleware
    // ============================================================
    
    console.log('\n--- ACL Middleware ---\n');
    
    // Create ACL with standard roles
    const acl = getACL({
      roles: {
        admin: {
          permissions: ['*'], // All permissions
          inherits: []
        },
        manager: {
          permissions: [
            'read:tasks', 'write:tasks', 'delete:tasks',
            'read:users', 'write:users'
          ],
          inherits: ['developer']
        },
        developer: {
          permissions: ['read:tasks', 'write:tasks', 'read:code'],
          inherits: ['viewer']
        },
        viewer: {
          permissions: ['read:tasks', 'read:code'],
          inherits: []
        }
      }
    });
    
    console.log('Role Hierarchy:');
    console.log('  admin → manager → developer → viewer\n');
    
    // Test permission checks
    const testUsers = [
      { id: 'dev1', role: 'developer' },
      { id: 'admin1', role: 'admin' },
      { id: 'viewer1', role: 'viewer' }
    ];
    
    const testPermissions = [
      'read:tasks',
      'write:tasks',
      'delete:users',
      'system:config'
    ];
    
    testUsers.forEach(user => {
      console.log(`Permission check (${user.role}):`);
      testPermissions.forEach(perm => {
        const allowed = acl.hasPermission(user.role, perm);
        console.log(`  ${perm} → ${allowed ? '✅ Allow' : '❌ Deny'}`);
      });
      console.log();
    });
    
    // Demonstrate middleware usage
    console.log('--- ACL Middleware Usage ---\n');
    
    const protectedResource = (req, res) => {
      console.log(`✅ Access granted to ${req.user.id}`);
      console.log(`   Resource: ${req.path}`);
      console.log(`   Action: ${req.method}`);
    };
    
    const accessCheck = acl.middleware('write:tasks');
    
    // Simulate request
    const authRequest = {
      user: { id: 'dev1', role: 'developer' },
      path: '/api/tasks/123',
      method: 'POST'
    };
    
    console.log('Request:', authRequest.method, authRequest.path);
    console.log('User:', authRequest.user.id, `(${authRequest.user.role})`);
    console.log('Required permission: write:tasks');
    
    accessCheck(authRequest, mockResponse, () => {
      protectedResource(authRequest, mockResponse);
    });

    // ============================================================
    // Part 3: Circuit Breaker
    // ============================================================
    
    console.log('\n--- Circuit Breaker ---\n');
    
    // Create a circuit breaker for external service
    const circuitBreaker = getCircuitBreaker('external-api', {
      failureThreshold: 5,
      resetTimeout: 5000, // 5 seconds for demo
      monitoringPeriod: 10000
    });
    
    console.log('Circuit configuration:');
    console.log(`  Failure threshold: ${circuitBreaker.config.failureThreshold}`);
    console.log(`  Reset timeout: ${circuitBreaker.config.resetTimeout}ms`);
    console.log(`  State: ${circuitBreaker.state}\n`);
    
    // Simulate successful calls
    console.log('Simulating successful calls...');
    for (let i = 0; i < 3; i++) {
      try {
        const result = await circuitBreaker.execute(async () => {
          return { data: `success-${i}`, latency: 50 };
        });
        console.log(`  Call ${i + 1}: ✅ (${result.data})`);
      } catch (error) {
        console.log(`  Call ${i + 1}: ❌ ${error.message}`);
      }
    }
    
    // Simulate failures
    console.log('\nSimulating failures...');
    for (let i = 0; i < 6; i++) {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Service unavailable');
        });
      } catch (error) {
        console.log(`  Failure ${i + 1}/6: ${circuitBreaker.state} - ${error.message}`);
      }
    }
    
    // Circuit should be OPEN now
    console.log(`\nCircuit state: ${circuitBreaker.state}`);
    
    // Try another call while OPEN
    try {
      await circuitBreaker.execute(async () => {
        return { data: 'should-not-reach' };
      });
    } catch (error) {
      console.log(`Call while OPEN: ❌ ${error.message}`);
    }
    
    // Wait for reset timeout
    console.log(`\nWaiting ${circuitBreaker.config.resetTimeout}ms for reset timeout...`);
    await sleep(circuitBreaker.config.resetTimeout);
    
    // Next call should transition to HALF_OPEN
    console.log(`Circuit state after timeout: ${circuitBreaker.state}`);
    
    // Success in HALF_OPEN should close the circuit
    try {
      const result = await circuitBreaker.execute(async () => {
        return { data: 'recovery' };
      });
      console.log(`Recovery call: ✅ ${result.data}`);
      console.log(`Circuit state: ${circuitBreaker.state}`);
    } catch (error) {
      console.log(`Recovery call: ❌ ${error.message}`);
    }
    
    // Get circuit statistics
    console.log('\nCircuit statistics:');
    const stats = circuitBreaker.getStats();
    console.log(`  Total calls: ${stats.totalCalls}`);
    console.log(`  Successes: ${stats.successes}`);
    console.log(`  Failures: ${stats.failures}`);
    console.log(`  Rejections: ${stats.rejections}`);
    console.log(`  Success rate: ${stats.successRate}%`);

    // ============================================================
    // Part 4: Metrics Middleware
    // ============================================================
    
    console.log('\n--- Metrics Middleware ---\n');
    
    const metrics = getMetricsMiddleware({
      collectDefaultMetrics: true,
      requestDurationBuckets: [10, 50, 100, 200, 500, 1000]
    });
    
    // Simulate HTTP requests
    const requests = [
      { duration: 45, status: 200 },
      { duration: 120, status: 200 },
      { duration: 80, status: 200 },
      { duration: 200, status: 500 },
      { duration: 30, status: 200 }
    ];
    
    console.log('Recording request metrics...\n');
    
    requests.forEach((req, i) => {
      metrics.recordRequest({
        method: 'GET',
        path: '/api/tasks',
        duration: req.duration,
        statusCode: req.status
      });
      console.log(`  Request ${i + 1}: ${req.duration}ms, status ${req.status}`);
    });
    
    // Get metrics report
    const metricsReport = metrics.getMetrics();
    console.log('\nMetrics summary:');
    console.log(`  Total requests: ${metricsReport.totalRequests}`);
    console.log(`  Success rate: ${metricsReport.successRate}%`);
    console.log(`  Average latency: ${metricsReport.avgLatency}ms`);
    console.log(`  p95 latency: ${metricsReport.p95Latency}ms`);
    console.log(`  p99 latency: ${metricsReport.p99Latency}ms`);

    // ============================================================
    // Part 5: Audit Middleware
    // ============================================================
    
    console.log('\n--- Audit Middleware ---\n');
    
    const audit = getAuditMiddleware({
      logLevel: 'info',
      includeRequestBody: true,
      includeResponseBody: false,
      sensitiveFields: ['password', 'token', 'secret']
    });
    
    // Simulate audited requests
    const auditRequests = [
      {
        timestamp: new Date().toISOString(),
        userId: 'user-123',
        action: 'READ',
        resource: '/api/tasks',
        status: 200
      },
      {
        timestamp: new Date().toISOString(),
        userId: 'user-123',
        action: 'WRITE',
        resource: '/api/tasks/123',
        body: { title: 'New Task', password: '***' }, // PII redacted
        status: 201
      },
      {
        timestamp: new Date().toISOString(),
        userId: 'admin-456',
        action: 'DELETE',
        resource: '/api/users/789',
        status: 204
      }
    ];
    
    console.log('Recording audit events...\n');
    
    auditRequests.forEach((req, i) => {
      audit.log(req);
      console.log(`  [${req.timestamp}] ${req.userId} ${req.action} ${req.resource}`);
    });
    
    // Get audit log
    const auditLog = audit.getLog();
    console.log(`\nTotal audit entries: ${auditLog.length}`);
    
    // Filter audit log
    const userActions = audit.filter({ userId: 'user-123' });
    console.log(`Actions by user-123: ${userActions.length}`);

    // ============================================================
    // Part 6: Middleware Pipeline
    // ============================================================
    
    console.log('\n--- Middleware Pipeline ---\n');
    
    // Compose multiple middlewares
    const pipeline = [
      authMiddleware.middleware,
      acl.middleware('read:tasks'),
      metrics.middleware,
      audit.middleware
    ];
    
    console.log('Middleware pipeline:');
    console.log('  1. Authentication');
    console.log('  2. ACL Check');
    console.log('  3. Metrics Collection');
    console.log('  4. Audit Logging');
    
    // Simulate request through pipeline
    const pipelineRequest = {
      headers: { authorization: `Bearer ${token}` },
      user: { id: 'dev1', role: 'developer' },
      path: '/api/tasks',
      method: 'GET',
      body: null
    };
    
    console.log('\nExecuting pipeline...');
    
    // In real implementation, each middleware calls next()
    // Here we just simulate the flow
    console.log('✅ Request authenticated');
    console.log('✅ Permission check passed');
    console.log('✅ Metrics recorded');
    console.log('✅ Audit log entry created');
    console.log('\n✅ Request processed successfully');

    console.log('\n✅ Middleware example complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await bios.shutdown();
    console.log('\n✅ BIOS shutdown complete');
  }
}

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. Authentication:
//    - JWT token generation and verification
//    - Multiple auth modes (JWT, API key, session)
//    - Request authentication flow
//
// 2. ACL (Access Control):
//    - Role-based access control
//    - Role hierarchy and inheritance
//    - Permission checking
//
// 3. Circuit Breaker:
//    - Fault tolerance pattern
//    - States: CLOSED, OPEN, HALF_OPEN
//    - Automatic recovery
//
// 4. Metrics:
//    - Request tracking
//    - Latency histograms
//    - Success rate calculation
//
// 5. Audit:
//    - Action logging
//    - PII redaction
//    - Log filtering
//
// 6. Middleware Pipeline:
//    - Composing multiple middlewares
//    - Order of execution
//    - Error handling
//
// ============================================================
