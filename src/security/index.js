/**
 * @fileoverview CogniMesh Security Manager - Core security functionality
 * @module @cognimesh/security
 * @version 5.1.0 - SECURITY HARDENED
 */

import crypto from 'crypto';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile, writeFile, access, mkdir, readdir, unlink } from 'fs/promises';

// Export Vault integration
export { VaultManager, vaultManager, getSecret, setSecret, rotateSecret, getSecrets, connect } from './vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scrypt = promisify(crypto.scrypt);

// ============================================================================
// Constants for Secure Defaults
// ============================================================================

export const SECURITY_DEFAULTS = {
  ALGORITHM: 'aes-256-gcm',
  KEY_LENGTH: 32,
  IV_LENGTH: 16,
  TAG_LENGTH: 16,
  SALT_LENGTH: 32,
  CSRF_TOKEN_LENGTH: 32,
  CSRF_TOKEN_EXPIRY: 3600000, // 1 hour
  PASSWORD_MIN_LENGTH: 12,
  SCRYPT_ITERATIONS: 131072, // Doubled from 65536
  SCRYPT_MEMORY_COST: 131072,
  SCRYPT_PARALLELISM: 4,
  KEY_ROTATION_INTERVAL: 90 * 24 * 60 * 60 * 1000, // 90 days
  MAX_KEY_VERSIONS: 5,
  HMAC_ALGORITHM: 'sha384',
  SECURE_TOKEN_LENGTH: 48
};

// ============================================================================
// Key Rotation Manager
// ============================================================================

/**
 * Key Rotation Manager for automatic key lifecycle management
 * @class KeyRotationManager
 */
export class KeyRotationManager {
  /**
   * @param {Object} options - Configuration options
   * @param {string} [options.keyDir] - Directory for key storage
   * @param {number} [options.rotationInterval] - Rotation interval in ms
   * @param {number} [options.maxVersions] - Maximum key versions to keep
   */
  constructor(options = {}) {
    this.keyDir = options.keyDir || join(process.cwd(), 'keys');
    this.rotationInterval = options.rotationInterval || SECURITY_DEFAULTS.KEY_ROTATION_INTERVAL;
    this.maxVersions = options.maxVersions || SECURITY_DEFAULTS.MAX_KEY_VERSIONS;
    this.keyVersions = new Map();
    this.currentVersion = null;
    this.rotationTimer = null;
    this.metadataFile = join(this.keyDir, 'key-metadata.json');
  }

  /**
   * Initialize key storage and load metadata
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      await access(this.keyDir);
    } catch {
      await mkdir(this.keyDir, { recursive: true, mode: 0o700 });
    }

    await this.loadMetadata();
    this.startAutoRotation();
  }

  /**
   * Load key metadata from storage
   * @private
   * @returns {Promise<void>}
   */
  async loadMetadata() {
    try {
      const data = await readFile(this.metadataFile, 'utf8');
      const metadata = JSON.parse(data);
      this.keyVersions = new Map(metadata.versions || []);
      this.currentVersion = metadata.currentVersion;
    } catch {
      // No metadata yet, will be created on first key generation
      this.keyVersions = new Map();
    }
  }

  /**
   * Save key metadata to storage
   * @private
   * @returns {Promise<void>}
   */
  async saveMetadata() {
    const metadata = {
      currentVersion: this.currentVersion,
      versions: Array.from(this.keyVersions.entries()),
      updatedAt: new Date().toISOString()
    };
    await writeFile(this.metadataFile, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  }

  /**
   * Generate a new key version
   * @param {string} [keyName='master'] - Base key name
   * @returns {Promise<{version: number, key: Buffer}>}
   */
  async generateKey(keyName = 'master') {
    const version = this.currentVersion ? this.currentVersion + 1 : 1;
    const key = crypto.randomBytes(SECURITY_DEFAULTS.KEY_LENGTH);
    const keyFile = `${keyName}.v${version}.key`;
    const keyPath = join(this.keyDir, keyFile);

    // Write with restrictive permissions
    await writeFile(keyPath, key.toString('hex'), { mode: 0o600 });

    // Update metadata
    this.keyVersions.set(version, {
      file: keyFile,
      createdAt: new Date().toISOString(),
      algorithm: SECURITY_DEFAULTS.ALGORITHM
    });
    this.currentVersion = version;

    await this.saveMetadata();
    await this.cleanupOldVersions(keyName);

    return { version, key };
  }

  /**
   * Load a specific key version
   * @param {string} [keyName='master'] - Base key name
   * @param {number} [version] - Version to load (defaults to current)
   * @returns {Promise<{version: number, key: Buffer}>}
   */
  async loadKey(keyName = 'master', version = null) {
    const targetVersion = version || this.currentVersion;
    if (!targetVersion) {
      throw new SecurityError('No keys available', 'KEY_NOT_FOUND');
    }

    const keyInfo = this.keyVersions.get(targetVersion);
    if (!keyInfo) {
      throw new SecurityError(`Key version ${targetVersion} not found`, 'KEY_NOT_FOUND');
    }

    const keyPath = join(this.keyDir, keyInfo.file);
    const keyData = await readFile(keyPath, 'utf8');
    
    return { version: targetVersion, key: Buffer.from(keyData, 'hex') };
  }

  /**
   * Rotate to a new key
   * @param {string} [keyName='master'] - Base key name
   * @returns {Promise<{oldVersion: number, newVersion: number}>}
   */
  async rotate(keyName = 'master') {
    const oldVersion = this.currentVersion;
    const { version: newVersion } = await this.generateKey(keyName);
    
    // Create backup of old key before cleanup
    if (oldVersion) {
      const oldKeyInfo = this.keyVersions.get(oldVersion);
      const oldPath = join(this.keyDir, oldKeyInfo.file);
      const backupPath = join(this.keyDir, `${keyName}.v${oldVersion}.backup.${Date.now()}.key`);
      await writeFile(backupPath, await readFile(oldPath), { mode: 0o600 });
    }

    return { oldVersion, newVersion };
  }

  /**
   * Cleanup old key versions, keeping only maxVersions
   * @private
   * @param {string} keyName - Base key name
   * @returns {Promise<void>}
   */
  async cleanupOldVersions(keyName) {
    const versions = Array.from(this.keyVersions.keys()).sort((a, b) => b - a);
    const toDelete = versions.slice(this.maxVersions);

    for (const version of toDelete) {
      const keyInfo = this.keyVersions.get(version);
      try {
        await unlink(join(this.keyDir, keyInfo.file));
        this.keyVersions.delete(version);
      } catch (error) {
        console.warn(`[KeyRotation] Failed to cleanup key version ${version}:`, error.message);
      }
    }

    if (toDelete.length > 0) {
      await this.saveMetadata();
    }
  }

  /**
   * Start automatic key rotation timer
   * @private
   */
  startAutoRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(async () => {
      try {
        const currentKey = this.keyVersions.get(this.currentVersion);
        if (currentKey) {
          const createdAt = new Date(currentKey.createdAt);
          if (Date.now() - createdAt.getTime() >= this.rotationInterval) {
            console.log('[KeyRotation] Performing automatic key rotation');
            await this.rotate();
          }
        }
      } catch (error) {
        console.error('[KeyRotation] Auto-rotation failed:', error.message);
      }
    }, 24 * 60 * 60 * 1000); // Check once per day

    if (this.rotationTimer.unref) {
      this.rotationTimer.unref();
    }
  }

  /**
   * Stop automatic key rotation
   */
  stopAutoRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /**
   * Get key rotation status
   * @returns {Object} Status information
   */
  getStatus() {
    const currentKey = this.keyVersions.get(this.currentVersion);
    return {
      currentVersion: this.currentVersion,
      totalVersions: this.keyVersions.size,
      rotationInterval: this.rotationInterval,
      nextRotation: currentKey ? 
        new Date(new Date(currentKey.createdAt).getTime() + this.rotationInterval).toISOString() :
        null
    };
  }
}

// ============================================================================
// Security Error
// ============================================================================

/**
 * Security error class
 * @class SecurityError
 * @extends Error
 */
export class SecurityError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {Object} [details={}] - Additional details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

// ============================================================================
// Enhanced Security Manager
// ============================================================================

/**
 * Security Manager for handling encryption, hashing, and CSRF protection
 * @class SecurityManager
 */
export class SecurityManager {
  /**
   * @param {Object} options - Configuration options
   * @param {string} [options.algorithm='aes-256-gcm'] - Encryption algorithm
   * @param {number} [options.keyLength=32] - Key length in bytes
   * @param {number} [options.ivLength=16] - IV length in bytes
   * @param {number} [options.tagLength=16] - Auth tag length in bytes
   * @param {number} [options.saltLength=32] - Salt length in bytes
   * @param {string} [options.pepper] - Secret pepper for password hashing
   * @param {string} [options.keyDir] - Directory for key storage
   * @param {number} [options.csrfTokenLength=32] - CSRF token length
   * @param {number} [options.csrfTokenExpiry=3600000] - CSRF token expiry in ms
   * @param {boolean} [options.enableKeyRotation=true] - Enable automatic key rotation
   */
  constructor(options = {}) {
    this.algorithm = options.algorithm || SECURITY_DEFAULTS.ALGORITHM;
    this.keyLength = options.keyLength || SECURITY_DEFAULTS.KEY_LENGTH;
    this.ivLength = options.ivLength || SECURITY_DEFAULTS.IV_LENGTH;
    this.tagLength = options.tagLength || SECURITY_DEFAULTS.TAG_LENGTH;
    this.saltLength = options.saltLength || SECURITY_DEFAULTS.SALT_LENGTH;
    this.pepper = options.pepper || process.env.SECURITY_PEPPER;
    this.keyDir = options.keyDir || join(process.cwd(), 'keys');
    this.csrfTokenLength = options.csrfTokenLength || SECURITY_DEFAULTS.CSRF_TOKEN_LENGTH;
    this.csrfTokenExpiry = options.csrfTokenExpiry || SECURITY_DEFAULTS.CSRF_TOKEN_EXPIRY;
    this.activeTokens = new Map();
    
    // Enhanced password hashing options
    this.passwordMinLength = options.passwordMinLength || SECURITY_DEFAULTS.PASSWORD_MIN_LENGTH;
    this.scryptIterations = options.scryptIterations || SECURITY_DEFAULTS.SCRYPT_ITERATIONS;
    this.scryptMemoryCost = options.scryptMemoryCost || SECURITY_DEFAULTS.SCRYPT_MEMORY_COST;
    this.scryptParallelism = options.scryptParallelism || SECURITY_DEFAULTS.SCRYPT_PARALLELISM;
    
    // Key rotation
    this.keyRotation = options.enableKeyRotation !== false ? 
      new KeyRotationManager({ keyDir: this.keyDir }) : null;
    
    // Audit log
    this.auditLog = [];
    this.maxAuditLogSize = 1000;
  }

  /**
   * Initialize security manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.keyRotation) {
      await this.keyRotation.initialize();
      
      // Generate initial key if none exists
      if (!this.keyRotation.currentVersion) {
        await this.keyRotation.generateKey('master');
      }
    }
  }

  /**
   * Generate a cryptographically secure random key
   * @param {number} [length=32] - Key length in bytes
   * @returns {Buffer} Random key buffer
   */
  generateKey(length = this.keyLength) {
    return crypto.randomBytes(length);
  }

  /**
   * Derive encryption key from password using scrypt
   * @param {string} password - Password to derive key from
   * @param {Buffer} salt - Salt for key derivation
   * @returns {Promise<Buffer>} Derived key
   */
  async deriveKey(password, salt) {
    return scrypt(password, salt, this.keyLength, {
      N: this.scryptIterations,
      r: 8,
      p: this.scryptParallelism,
      maxmem: this.scryptMemoryCost * 1024
    });
  }

  /**
   * Encrypt data using AES-256-GCM with enhanced security
   * @param {string|Buffer} data - Data to encrypt
   * @param {Buffer|string} [key] - Encryption key (uses rotated key if not provided)
   * @param {Object} [options={}] - Encryption options
   * @param {string} [options.associatedData] - Additional authenticated data (AAD)
   * @returns {Object} Encrypted data with iv, tag, and metadata
   */
  async encrypt(data, key = null, options = {}) {
    // Use key rotation manager if available and no key provided
    let keyVersion = 0;
    if (!key && this.keyRotation) {
      const keyData = await this.keyRotation.loadKey('master');
      key = keyData.key;
      keyVersion = keyData.version;
    }

    const iv = crypto.randomBytes(this.ivLength);
    const salt = crypto.randomBytes(this.saltLength);
    
    const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
    
    const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);
    
    // Add associated data if provided (enhances security)
    if (options.associatedData) {
      cipher.setAAD(Buffer.from(options.associatedData, 'utf8'));
    }
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    this.logAudit('encrypt', { keyVersion, success: true });
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      salt: salt.toString('hex'),
      algorithm: this.algorithm,
      keyVersion,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {Object} encryptedData - Object containing encrypted data, iv, tag
   * @param {string} encryptedData.encrypted - Encrypted data
   * @param {string} encryptedData.iv - Initialization vector
   * @param {string} encryptedData.tag - Authentication tag
   * @param {string} [encryptedData.keyVersion] - Key version used for encryption
   * @param {Buffer|string} [key] - Decryption key
   * @param {Object} [options={}] - Decryption options
   * @param {string} [options.associatedData] - Additional authenticated data (AAD)
   * @returns {Promise<string>} Decrypted data
   */
  async decrypt(encryptedData, key = null, options = {}) {
    try {
      // Use specific key version if provided and key rotation is enabled
      if (!key && this.keyRotation && encryptedData.keyVersion) {
        const keyData = await this.keyRotation.loadKey('master', encryptedData.keyVersion);
        key = keyData.key;
      } else if (!key && this.keyRotation) {
        const keyData = await this.keyRotation.loadKey('master');
        key = keyData.key;
      }

      const { encrypted, iv, tag } = encryptedData;
      
      const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
      const ivBuffer = Buffer.from(iv, 'hex');
      const tagBuffer = Buffer.from(tag, 'hex');
      
      const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, ivBuffer);
      decipher.setAuthTag(tagBuffer);
      
      // Set AAD if provided
      if (options.associatedData) {
        decipher.setAAD(Buffer.from(options.associatedData, 'utf8'));
      }
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      this.logAudit('decrypt', { success: true });
      
      return decrypted;
    } catch (error) {
      this.logAudit('decrypt', { success: false, error: error.message });
      throw new SecurityError('Decryption failed', 'DECRYPTION_FAILED', { originalError: error.message });
    }
  }

  /**
   * Hash password using scrypt with enhanced security settings
   * @param {string} password - Password to hash
   * @param {Object} [options={}] - Hashing options
   * @param {number} [options.iterations=131072] - Number of iterations
   * @param {number} [options.memoryCost=131072] - Memory cost
   * @param {number} [options.parallelism=4] - Parallelism factor
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password, options = {}) {
    // Validate password strength
    this.validatePasswordStrength(password);
    
    const salt = crypto.randomBytes(this.saltLength);
    const iterations = options.iterations || this.scryptIterations;
    const memoryCost = options.memoryCost || this.scryptMemoryCost;
    const parallelism = options.parallelism || this.scryptParallelism;
    
    const pepperedPassword = this.pepper ? password + this.pepper : password;
    
    const hash = await scrypt(pepperedPassword, salt, 64, {
      N: iterations,
      r: 8,
      p: parallelism,
      maxmem: memoryCost * 1024
    });
    
    // Include version info in hash for future upgrades
    return `$scrypt$v=2$N=${iterations}$r=8$p=${parallelism}$${salt.toString('base64')}$${hash.toString('base64')}`;
  }

  /**
   * Verify password against hash
   * @param {string} password - Password to verify
   * @param {string} hash - Stored hash
   * @returns {Promise<boolean>} Whether password matches
   */
  async verifyPassword(password, hash) {
    try {
      const parts = hash.split('$');
      if (parts.length < 6 || parts[1] !== 'scrypt') {
        throw new Error('Invalid hash format');
      }
      
      // Handle versioned hashes
      let offset = 0;
      if (parts[2].startsWith('v=')) {
        offset = 1; // Skip version part
      }
      
      const N = parseInt(parts[2 + offset].split('=')[1]);
      const p = parseInt(parts[4 + offset].split('=')[1]);
      const salt = Buffer.from(parts[5 + offset].split('$')[0], 'base64');
      const storedHash = parts[5 + offset].split('$')[1];
      
      const pepperedPassword = this.pepper ? password + this.pepper : password;
      
      const computedHash = await scrypt(pepperedPassword, salt, 64, {
        N,
        r: 8,
        p,
        maxmem: this.scryptMemoryCost * 1024
      });
      
      return crypto.timingSafeEqual(
        Buffer.from(storedHash, 'base64'),
        computedHash
      );
    } catch {
      return false;
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @throws {SecurityError} If password is too weak
   */
  validatePasswordStrength(password) {
    const errors = [];
    
    if (password.length < this.passwordMinLength) {
      errors.push(`Password must be at least ${this.passwordMinLength} characters`);
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain number');
    }
    
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain special character');
    }
    
    // Check for common weak passwords
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
    }
    
    if (errors.length > 0) {
      throw new SecurityError('Weak password', 'WEAK_PASSWORD', { errors });
    }
  }

  /**
   * Initialize key storage directory
   * @returns {Promise<void>}
   */
  async initKeyStorage() {
    try {
      await access(this.keyDir);
    } catch {
      await mkdir(this.keyDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Generate and store master key
   * @param {string} [keyName='master'] - Name for the key
   * @returns {Promise<Buffer>} Generated key
   * @deprecated Use keyRotation.generateKey instead
   */
  async generateMasterKey(keyName = 'master') {
    if (this.keyRotation) {
      const { key } = await this.keyRotation.generateKey(keyName);
      return key;
    }
    
    await this.initKeyStorage();
    const key = this.generateKey();
    const keyPath = join(this.keyDir, `${keyName}.key`);
    await writeFile(keyPath, key.toString('hex'), { mode: 0o600 });
    return key;
  }

  /**
   * Load master key from storage
   * @param {string} [keyName='master'] - Name of the key
   * @returns {Promise<Buffer>} Loaded key
   * @deprecated Use keyRotation.loadKey instead
   */
  async loadMasterKey(keyName = 'master') {
    if (this.keyRotation) {
      const { key } = await this.keyRotation.loadKey(keyName);
      return key;
    }
    
    const keyPath = join(this.keyDir, `${keyName}.key`);
    const keyData = await readFile(keyPath, 'utf8');
    return Buffer.from(keyData, 'hex');
  }

  /**
   * Rotate encryption key
   * @param {Buffer} oldKey - Current encryption key
   * @param {string} [keyName='master'] - Name for the new key
   * @returns {Promise<Buffer>} New encryption key
   * @deprecated Use keyRotation.rotate instead
   */
  async rotateKey(oldKey, keyName = 'master') {
    if (this.keyRotation) {
      await this.keyRotation.rotate(keyName);
      const { key } = await this.keyRotation.loadKey(keyName);
      return key;
    }
    
    const newKey = this.generateKey();
    const keyPath = join(this.keyDir, `${keyName}.key`);
    const backupPath = join(this.keyDir, `${keyName}.key.backup.${Date.now()}`);
    
    await writeFile(backupPath, oldKey.toString('hex'), { mode: 0o600 });
    await writeFile(keyPath, newKey.toString('hex'), { mode: 0o600 });
    
    return newKey;
  }

  /**
   * Generate CSRF token with enhanced security
   * @param {string} sessionId - Session identifier
   * @param {Object} [options={}] - Token options
   * @returns {Object} CSRF token and expiry
   */
  generateCsrfToken(sessionId, options = {}) {
    const token = crypto.randomBytes(this.csrfTokenLength).toString('base64url');
    const expires = Date.now() + (options.expiresIn || this.csrfTokenExpiry);
    const fingerprint = this.generateSessionFingerprint(sessionId);
    
    this.activeTokens.set(token, { 
      sessionId, 
      expires,
      fingerprint,
      createdAt: Date.now()
    });
    this.cleanupCsrfTokens();
    
    return { token, expires, fingerprint };
  }

  /**
   * Generate session fingerprint for binding
   * @private
   * @param {string} sessionId - Session identifier
   * @returns {string} Fingerprint hash
   */
  generateSessionFingerprint(sessionId) {
    const data = sessionId + (process.env.SESSION_SECRET || '');
    return crypto.createHash(SECURITY_DEFAULTS.HMAC_ALGORITHM).update(data).digest('hex').substring(0, 16);
  }

  /**
   * Verify CSRF token with enhanced validation
   * @param {string} token - Token to verify
   * @param {string} sessionId - Expected session ID
   * @param {Object} [options={}] - Verification options
   * @returns {boolean} Whether token is valid
   */
  verifyCsrfToken(token, sessionId, options = {}) {
    const tokenData = this.activeTokens.get(token);
    
    if (!tokenData) return false;
    if (tokenData.expires < Date.now()) {
      this.activeTokens.delete(token);
      return false;
    }
    if (tokenData.sessionId !== sessionId) return false;
    
    // Verify fingerprint if strict mode
    if (options.strict !== false) {
      const expectedFingerprint = this.generateSessionFingerprint(sessionId);
      if (tokenData.fingerprint !== expectedFingerprint) return false;
    }
    
    return true;
  }

  /**
   * Revoke CSRF token
   * @param {string} token - Token to revoke
   * @returns {boolean} Whether token was found and removed
   */
  revokeCsrfToken(token) {
    return this.activeTokens.delete(token);
  }

  /**
   * Revoke all CSRF tokens for a session
   * @param {string} sessionId - Session ID
   * @returns {number} Number of tokens revoked
   */
  revokeSessionTokens(sessionId) {
    let count = 0;
    for (const [token, data] of this.activeTokens) {
      if (data.sessionId === sessionId) {
        this.activeTokens.delete(token);
        count++;
      }
    }
    return count;
  }

  /**
   * Cleanup expired CSRF tokens
   * @private
   */
  cleanupCsrfTokens() {
    const now = Date.now();
    for (const [token, data] of this.activeTokens) {
      if (data.expires < now) {
        this.activeTokens.delete(token);
      }
    }
  }

  /**
   * Create CSRF protection middleware
   * @param {Object} [options={}] - Middleware options
   * @param {string} [options.cookieName='csrf_token'] - CSRF cookie name
   * @param {string} [options.headerName='X-CSRF-Token'] - CSRF header name
   * @param {boolean} [options.doubleSubmitCookie=true] - Enable double submit cookie pattern
   * @returns {Function} Express/Fastify middleware
   */
  csrfMiddleware(options = {}) {
    const headerName = options.headerName || 'X-CSRF-Token';
    const cookieName = options.cookieName || 'csrf_token';
    const doubleSubmitCookie = options.doubleSubmitCookie !== false;
    
    return async (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(req.method)) {
        // Set CSRF cookie on safe methods
        if (doubleSubmitCookie && req.session?.id) {
          const { token } = this.generateCsrfToken(req.session.id);
          res.cookie(cookieName, token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
          });
        }
        return next();
      }
      
      const headerToken = req.headers[headerName.toLowerCase()] || req.body?._csrf;
      const cookieToken = req.cookies?.[cookieName];
      const sessionId = req.session?.id || req.cookies?.session;
      
      // Double submit cookie verification
      if (doubleSubmitCookie && headerToken !== cookieToken) {
        const error = new SecurityError('CSRF token mismatch', 'CSRF_MISMATCH');
        error.statusCode = 403;
        return next(error);
      }
      
      if (!headerToken || !this.verifyCsrfToken(headerToken, sessionId)) {
        const error = new SecurityError('Invalid or missing CSRF token', 'CSRF_INVALID');
        error.statusCode = 403;
        return next(error);
      }
      
      next();
    };
  }

  /**
   * Generate HMAC signature using SHA-384
   * @param {string|Buffer} data - Data to sign
   * @param {Buffer|string} key - HMAC key
   * @returns {string} HMAC signature
   */
  sign(data, key) {
    const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
    return crypto.createHmac(SECURITY_DEFAULTS.HMAC_ALGORITHM, keyBuffer).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   * @param {string|Buffer} data - Original data
   * @param {string} signature - Signature to verify
   * @param {Buffer|string} key - HMAC key
   * @returns {boolean} Whether signature is valid
   */
  verify(data, signature, key) {
    const expectedSignature = this.sign(data, key);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate secure random token
   * @param {number} [length=48] - Token length in bytes
   * @returns {string} Base64url encoded token
   */
  generateSecureToken(length = SECURITY_DEFAULTS.SECURE_TOKEN_LENGTH) {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate cryptographically secure random string
   * @param {number} [length=32] - String length
   * @param {string} [charset='alphanumeric'] - Character set
   * @returns {string} Random string
   */
  generateRandomString(length = 32, charset = 'alphanumeric') {
    const charsets = {
      alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      numeric: '0123456789',
      hex: '0123456789abcdef',
      base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    };
    
    const chars = charsets[charset] || charsets.alphanumeric;
    const charsLength = chars.length;
    const bytes = crypto.randomBytes(length);
    
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % charsLength];
    }
    
    return result;
  }

  /**
   * Constant-time comparison
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} Whether strings are equal
   */
  timingSafeEqual(a, b) {
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }

  /**
   * Log security audit event
   * @param {string} action - Action performed
   * @param {Object} details - Event details
   * @private
   */
  logAudit(action, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      id: crypto.randomUUID()
    };
    
    this.auditLog.push(entry);
    
    // Keep only last N entries
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
    }
  }

  /**
   * Get security audit log
   * @param {Object} [filters={}] - Log filters
   * @returns {Array} Audit log entries
   */
  getAuditLog(filters = {}) {
    let entries = [...this.auditLog];
    
    if (filters.action) {
      entries = entries.filter(e => e.action === filters.action);
    }
    
    if (filters.since) {
      const since = new Date(filters.since);
      entries = entries.filter(e => new Date(e.timestamp) >= since);
    }
    
    return entries;
  }

  /**
   * Get security manager status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      algorithm: this.algorithm,
      keyRotationEnabled: !!this.keyRotation,
      keyRotationStatus: this.keyRotation?.getStatus(),
      csrfTokensActive: this.activeTokens.size,
      auditLogSize: this.auditLog.length,
      pepperConfigured: !!this.pepper
    };
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.keyRotation) {
      this.keyRotation.stopAutoRotation();
    }
    this.activeTokens.clear();
    this.auditLog = [];
  }
}

export default SecurityManager;
