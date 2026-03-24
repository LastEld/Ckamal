/**
 * File Locking System
 * Provides cross-process file locking capabilities
 * @module utils/file-lock
 */

import fs from "fs";
import path from "path";

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_STALE_THRESHOLD = 60000;

// In-memory tracking of locks held by this process
const locks = new Map();
const lockTimeouts = new Map();

/**
 * FileLock class for managing file locks
 */
export class FileLock {
    constructor(options = {}) {
        this.defaultTimeout = options.timeout || DEFAULT_TIMEOUT;
        this.staleThreshold = options.staleThreshold || DEFAULT_STALE_THRESHOLD;
        this.lockDir = options.lockDir || null;
    }

    /**
     * Acquire a lock on a file
     * @param {string} filePath - Path to the file to lock
     * @param {object} options - Lock options
     * @returns {Promise<object>} Lock handle with release method
     */
    async acquire(filePath, options = {}) {
        return this.lock(filePath, options);
    }

    /**
     * Acquire a lock on a file (alias for acquire)
     * @param {string} filePath - Path to the file to lock
     * @param {object} options - Lock options
     * @returns {Promise<object>} Lock handle with release method
     */
    async lock(filePath, options = {}) {
        const absolutePath = this._resolvePath(filePath);
        const lockPath = `${absolutePath}.lock`;
        const timeout = options.timeout || this.defaultTimeout;
        const retryInterval = options.retryInterval || 100;
        const maxRetries = options.maxRetries || Math.ceil(timeout / retryInterval);

        // Try to acquire lock
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const handle = await this._tryAcquire(absolutePath, lockPath, timeout);
                if (handle) {
                    return handle;
                }
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    throw error;
                }
            }

            // Wait before retry
            await this._sleep(retryInterval);
        }

        throw new Error(`Failed to acquire lock after ${timeout}ms: ${absolutePath}`);
    }

    /**
     * Try to acquire a lock
     * @private
     */
    async _tryAcquire(absolutePath, lockPath, timeout) {
        try {
            // Try to create lock file atomically
            const lockData = {
                pid: process.pid,
                timestamp: Date.now(),
                timeout
            };

            fs.writeFileSync(lockPath, JSON.stringify(lockData), { flag: "wx" });

            // Verify we own the lock
            const content = fs.readFileSync(lockPath, "utf8");
            const stored = JSON.parse(content);

            if (stored.pid !== process.pid) {
                // Another process got the lock
                throw new Error("Lock contention detected");
            }

            // Store in memory
            locks.set(absolutePath, lockPath);

            // Set up auto-release timeout
            const timeoutId = setTimeout(() => {
                this.unlock(absolutePath).catch(() => {});
            }, timeout);
            lockTimeouts.set(absolutePath, timeoutId);

            return {
                path: absolutePath,
                lockPath,
                release: () => this.unlock(absolutePath)
            };

        } catch (error) {
            if (error.code === "EEXIST") {
                // Lock file exists, check if stale
                if (this._isLockStale(lockPath)) {
                    this._breakStaleLock(lockPath);
                    // Retry immediately
                    return this._tryAcquire(absolutePath, lockPath, timeout);
                }
                return null;
            }
            throw error;
        }
    }

    /**
     * Release a lock
     * @param {string} filePath - Path to the locked file
     * @returns {Promise<boolean>} True if lock was released
     */
    async release(filePath) {
        return this.unlock(filePath);
    }

    /**
     * Release a lock (alias for release)
     * @param {string} filePath - Path to the locked file
     * @returns {Promise<boolean>} True if lock was released
     */
    async unlock(filePath) {
        const absolutePath = this._resolvePath(filePath);
        const lockPath = locks.get(absolutePath) || `${absolutePath}.lock`;

        // Clear timeout
        const timeoutId = lockTimeouts.get(absolutePath);
        if (timeoutId) {
            clearTimeout(timeoutId);
            lockTimeouts.delete(absolutePath);
        }

        // Remove lock file
        try {
            if (fs.existsSync(lockPath)) {
                const content = fs.readFileSync(lockPath, "utf8");
                const lockData = JSON.parse(content);

                // Only remove if we own it
                if (lockData.pid === process.pid) {
                    fs.unlinkSync(lockPath);
                }
            }
        } catch (error) {
            // Ignore errors during unlock
        }

        locks.delete(absolutePath);
        return true;
    }

    /**
     * Check if a file is locked
     * @param {string} filePath - Path to check
     * @returns {boolean}
     */
    isLocked(filePath) {
        const absolutePath = this._resolvePath(filePath);
        const lockPath = `${absolutePath}.lock`;

        if (!fs.existsSync(lockPath)) {
            return false;
        }

        // Check if lock is stale
        if (this._isLockStale(lockPath)) {
            return false;
        }

        return true;
    }

    /**
     * Wait for a lock to be released
     * @param {string} filePath - Path to wait for
     * @param {object} options - Wait options
     * @returns {Promise<boolean>} True if lock was released
     */
    async waitForUnlock(filePath, options = {}) {
        const absolutePath = this._resolvePath(filePath);
        const maxWait = options.maxWait || 5000;
        const checkInterval = options.checkInterval || 100;
        const startTime = Date.now();

        while (this.isLocked(absolutePath)) {
            if (Date.now() - startTime > maxWait) {
                return false;
            }
            await this._sleep(checkInterval);
        }

        return true;
    }

    /**
     * Execute a function with a lock
     * @param {string} filePath - File to lock
     * @param {Function} fn - Function to execute
     * @param {object} options - Lock options
     * @returns {Promise<any>} Function result
     */
    async withLock(filePath, fn, options = {}) {
        const lock = await this.lock(filePath, options);
        try {
            return await fn();
        } finally {
            await lock.release();
        }
    }

    /**
     * Check if a lock is stale
     * @private
     */
    _isLockStale(lockPath) {
        try {
            const content = fs.readFileSync(lockPath, "utf8");
            const lockData = JSON.parse(content);

            const age = Date.now() - lockData.timestamp;
            const threshold = lockData.timeout || this.staleThreshold;

            return age > threshold;
        } catch {
            // If we can't read the lock file, consider it stale
            return true;
        }
    }

    /**
     * Break a stale lock
     * @private
     */
    _breakStaleLock(lockPath) {
        try {
            fs.unlinkSync(lockPath);
        } catch {
            // Ignore errors
        }
    }

    /**
     * Resolve a path to absolute
     * @private
     */
    _resolvePath(filePath) {
        if (this.lockDir) {
            return path.resolve(this.lockDir, path.basename(filePath));
        }
        return path.resolve(filePath);
    }

    /**
     * Sleep for specified milliseconds
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get list of active locks held by this process
     * @returns {Array<string>}
     */
    getActiveLocks() {
        return Array.from(locks.keys());
    }

    /**
     * Release all locks held by this process
     */
    async releaseAll() {
        const promises = [];
        for (const filePath of locks.keys()) {
            promises.push(this.unlock(filePath));
        }
        await Promise.all(promises);
    }

    /**
     * Get lock statistics
     * @returns {object}
     */
    stats() {
        return {
            activeLocks: locks.size,
            lockPaths: Array.from(locks.values())
        };
    }
}

// Global FileLock instance
export const globalFileLock = new FileLock();

// Convenience functions using global instance
export const acquireLock = (filePath, options) => globalFileLock.lock(filePath, options);
export const releaseLock = (filePath) => globalFileLock.unlock(filePath);
export const isFileLocked = (filePath) => globalFileLock.isLocked(filePath);
export const withFileLock = (filePath, fn, options) => globalFileLock.withLock(filePath, fn, options);
export const waitForFileUnlock = (filePath, options) => globalFileLock.waitForUnlock(filePath, options);

// Cleanup on process exit
function cleanupLocks() {
    for (const [filePath, lockPath] of locks) {
        try {
            const timeoutId = lockTimeouts.get(filePath);
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
            }
        } catch {
            // Ignore cleanup errors
        }
    }
    locks.clear();
    lockTimeouts.clear();
}

process.on("exit", cleanupLocks);
process.on("SIGINT", cleanupLocks);
process.on("SIGTERM", cleanupLocks);
process.on("uncaughtException", cleanupLocks);
