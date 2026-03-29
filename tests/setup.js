/**
 * @fileoverview Test Setup - Database, fixtures, and helper functions
 * Provides test infrastructure for auth and API tests
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Test Database Configuration
// ============================================================================

const TEST_DB_PATH = ':memory:';

/**
 * Create a test database with all migrations applied
 * @returns {Promise<Database>} Configured test database
 */
export async function createTestDatabase() {
  const db = new Database(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Apply core schema migrations
  await applyMigrations(db);

  return db;
}

/**
 * Apply database migrations for testing
 * @param {Database} db - Database instance
 */
async function applyMigrations(db) {
  // Core auth tables (from migration 006)
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      uuid TEXT UNIQUE,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      description TEXT,
      pause_reason TEXT,
      paused_at DATETIME,
      brand_color TEXT,
      logo_url TEXT,
      settings TEXT DEFAULT '{}',
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
      budget_monthly_cents INTEGER DEFAULT 0,
      spent_monthly_cents INTEGER DEFAULT 0,
      require_approval_for_agents BOOLEAN DEFAULT 0,
      deleted_at DATETIME,
      deleted_by TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      email_verified BOOLEAN DEFAULT 0,
      image TEXT,
      password_hash TEXT,
      company_id TEXT,
      role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'guest')),
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
      last_login_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT,
      actor_id TEXT NOT NULL,
      actor_type TEXT DEFAULT 'agent' CHECK (actor_type IN ('user', 'agent')),
      company_id TEXT,
      permissions TEXT DEFAULT '[]',
      rate_limit INTEGER DEFAULT 500,
      expires_at DATETIME,
      last_used_at DATETIME,
      use_count INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      revoked_by TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS company_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE(company_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS company_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'suspended')),
      invited_by TEXT,
      invited_at DATETIME,
      joined_at DATETIME,
      permissions TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE(company_id, user_id)
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email) WHERE status != 'deleted';
    CREATE INDEX IF NOT EXISTS idx_auth_users_company ON auth_users(company_id) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_agent_api_keys_actor ON agent_api_keys(actor_id, actor_type);
    CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_company ON company_memberships(company_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON company_memberships(user_id) WHERE deleted_at IS NULL;
  `);
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Generate a test UUID
 * @returns {string} Random UUID
 */
export function generateUUID() {
  return randomBytes(16).toString('hex');
}

/**
 * Create test company data
 * @param {Object} overrides - Override default values
 * @returns {Object} Company data
 */
export function createCompanyFixture(overrides = {}) {
  const id = generateUUID();
  return {
    id,
    uuid: id,
    name: 'Test Company',
    slug: `test-company-${Date.now()}`,
    description: 'A test company for testing',
    status: 'active',
    brand_color: '#3B82F6',
    logo_url: null,
    settings: '{}',
    budget_monthly_cents: 0,
    spent_monthly_cents: 0,
    require_approval_for_agents: 0,
    created_by: null,
    ...overrides
  };
}

/**
 * Create test user data
 * @param {Object} overrides - Override default values
 * @returns {Object} User data
 */
export function createUserFixture(overrides = {}) {
  const id = generateUUID();
  return {
    id,
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    email_verified: 0,
    image: null,
    password_hash: null, // Will be set by auth service
    company_id: null,
    role: 'user',
    status: 'active',
    metadata: '{}',
    ...overrides
  };
}

/**
 * Create test API key data
 * @param {Object} overrides - Override default values
 * @returns {Object} API key data
 */
export function createApiKeyFixture(overrides = {}) {
  return {
    id: `cm_${randomBytes(4).toString('hex')}`,
    key_hash: randomBytes(32).toString('hex'),
    key_prefix: `cm_${randomBytes(4).toString('hex')}`,
    name: 'Test API Key',
    actor_id: generateUUID(),
    actor_type: 'user',
    company_id: null,
    permissions: '[]',
    rate_limit: 500,
    use_count: 0,
    ...overrides
  };
}

/**
 * Create test membership data
 * @param {Object} overrides - Override default values
 * @returns {Object} Membership data
 */
export function createMembershipFixture(overrides = {}) {
  return {
    uuid: generateUUID(),
    company_id: generateUUID(),
    user_id: generateUUID(),
    role: 'member',
    status: 'active',
    permissions: '{}',
    ...overrides
  };
}

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Insert a company directly into the database
 * @param {Database} db - Database instance
 * @param {Object} data - Company data
 * @returns {Object} Inserted company
 */
export function insertCompany(db, data) {
  const company = createCompanyFixture(data);
  const columns = Object.keys(company).filter(k => company[k] !== undefined);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => company[col]);

  const stmt = db.prepare(`
    INSERT INTO companies (${columns.join(', ')}) VALUES (${placeholders})
  `);
  stmt.run(...values);

  return db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id);
}

/**
 * Insert a user directly into the database
 * @param {Database} db - Database instance
 * @param {Object} data - User data
 * @returns {Object} Inserted user
 */
export function insertUser(db, data) {
  const user = createUserFixture(data);
  const columns = Object.keys(user).filter(k => user[k] !== undefined);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => user[col]);

  const stmt = db.prepare(`
    INSERT INTO auth_users (${columns.join(', ')}) VALUES (${placeholders})
  `);
  stmt.run(...values);

  return db.prepare('SELECT * FROM auth_users WHERE id = ?').get(user.id);
}

/**
 * Insert an API key directly into the database
 * @param {Database} db - Database instance
 * @param {Object} data - API key data
 * @returns {Object} Inserted API key
 */
export function insertApiKey(db, data) {
  const apiKey = createApiKeyFixture(data);
  const columns = Object.keys(apiKey).filter(k => apiKey[k] !== undefined);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => apiKey[col]);

  const stmt = db.prepare(`
    INSERT INTO agent_api_keys (${columns.join(', ')}) VALUES (${placeholders})
  `);
  stmt.run(...values);

  return db.prepare('SELECT * FROM agent_api_keys WHERE id = ?').get(apiKey.id);
}

/**
 * Insert a company membership directly into the database
 * @param {Database} db - Database instance
 * @param {Object} data - Membership data
 * @returns {Object} Inserted membership
 */
export function insertMembership(db, data) {
  const membership = createMembershipFixture(data);
  const columns = Object.keys(membership).filter(k => membership[k] !== undefined);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => membership[col]);

  const stmt = db.prepare(`
    INSERT INTO company_memberships (${columns.join(', ')}) VALUES (${placeholders})
  `);
  const result = stmt.run(...values);

  return db.prepare('SELECT * FROM company_memberships WHERE id = ?').get(result.lastInsertRowid);
}

// ============================================================================
// Mock Request/Response Helpers
// ============================================================================

/**
 * Create a mock HTTP request object
 * @param {Object} options - Request options
 * @returns {Object} Mock request object
 */
export function createMockRequest(options = {}) {
  const {
    method = 'GET',
    url = '/',
    headers = {},
    body = null,
    auth = null
  } = options;

  return {
    method,
    url,
    headers: {
      host: 'localhost:3000',
      ...headers
    },
    auth,
    *[Symbol.iterator]() {
      if (body) {
        const chunks = Array.isArray(body) ? body : [Buffer.from(JSON.stringify(body))];
        for (const chunk of chunks) {
          yield chunk;
        }
      }
    }
  };
}

/**
 * Create a mock HTTP response object
 * @returns {Object} Mock response object with capture methods
 */
export function createMockResponse() {
  const response = {
    statusCode: null,
    headers: {},
    data: null,
    parsedData: null,

    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = { ...this.headers, ...headers };
      // Set default content-type if not provided
      if (!this.headers['Content-Type']) {
        this.headers['Content-Type'] = 'application/json';
      }
    },

    end(data) {
      this.data = data;
      // Always try to parse JSON data regardless of content-type header
      if (data && typeof data === 'string') {
        try {
          this.parsedData = JSON.parse(data);
        } catch {
          this.parsedData = null;
        }
      }
    },

    getJson() {
      return this.parsedData;
    }
  };

  return response;
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Wait for a specified duration
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a test JWT secret
 * @returns {string} Random JWT secret
 */
export function generateTestSecret() {
  return randomBytes(64).toString('base64');
}

/**
 * Create test auth options for AuthService
 * @param {Database} db - Database instance
 * @returns {Object} Auth service options
 */
export function createTestAuthOptions(db) {
  return {
    db,
    mode: 'token',
    secret: generateTestSecret(),
    algorithm: 'HS256',
    tokenLifetime: 3600,
    refreshLifetime: 604800,
    autoGenerateSecret: false
  };
}

// ============================================================================
// Cleanup Helpers
// ============================================================================

/**
 * Clear all test data from database
 * @param {Database} db - Database instance
 */
export function clearTestData(db) {
  db.prepare('DELETE FROM agent_api_keys').run();
  db.prepare('DELETE FROM company_memberships').run();
  db.prepare('DELETE FROM company_members').run();
  db.prepare('DELETE FROM auth_sessions').run();
  db.prepare('DELETE FROM auth_users').run();
  db.prepare('DELETE FROM companies').run();
}

/**
 * Close test database
 * @param {Database} db - Database instance
 */
export function closeTestDatabase(db) {
  db.close();
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Check if a user object is valid (sanitized)
 * @param {Object} user - User object to check
 * @returns {boolean}
 */
export function isValidUser(user) {
  return user &&
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.name === 'string' &&
    !user.password_hash; // Password hash should be removed
}

/**
 * Check if an API key object is valid (sanitized)
 * @param {Object} apiKey - API key object to check
 * @returns {boolean}
 */
export function isValidApiKey(apiKey) {
  return apiKey &&
    typeof apiKey.id === 'string' &&
    typeof apiKey.key_prefix === 'string' &&
    !apiKey.key_hash; // Key hash should be removed
}

/**
 * Check if a response is a success response
 * @param {Object} response - Response object
 * @returns {boolean}
 */
export function isSuccessResponse(response) {
  return response &&
    response.statusCode >= 200 &&
    response.statusCode < 300 &&
    response.parsedData?.success === true;
}

/**
 * Check if a response is an error response
 * @param {Object} response - Response object
 * @param {number} expectedStatus - Expected status code
 * @returns {boolean}
 */
export function isErrorResponse(response, expectedStatus = null) {
  if (expectedStatus) {
    return response?.statusCode === expectedStatus;
  }
  return response && response.statusCode >= 400;
}

export default {
  createTestDatabase,
  generateUUID,
  createCompanyFixture,
  createUserFixture,
  createApiKeyFixture,
  createMembershipFixture,
  insertCompany,
  insertUser,
  insertApiKey,
  insertMembership,
  createMockRequest,
  createMockResponse,
  sleep,
  generateTestSecret,
  createTestAuthOptions,
  clearTestData,
  closeTestDatabase,
  isValidUser,
  isValidApiKey,
  isSuccessResponse,
  isErrorResponse
};
