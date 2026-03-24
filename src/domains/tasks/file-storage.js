/**
 * @fileoverview File Storage Abstraction for Task Attachments
 * @module domains/tasks/file-storage
 */

import { createHash } from 'crypto';

/**
 * File metadata
 * @typedef {Object} FileMetadata
 * @property {string} id - Unique file identifier
 * @property {string} originalName - Original filename
 * @property {string} mimeType - MIME type
 * @property {number} size - File size in bytes
 * @property {string} hash - Content hash (SHA-256)
 * @property {string} storagePath - Path in storage backend
 * @property {string} createdAt - Upload timestamp
 * @property {string} uploadedBy - Uploader user ID
 * @property {string} taskId - Associated task ID
 * @property {Object} metadata - Additional metadata
 */

/**
 * Storage backend interface
 * @typedef {Object} StorageBackend
 * @property {function(string, Buffer): Promise<string>} store - Store file, return path
 * @property {function(string): Promise<Buffer>} retrieve - Retrieve file by path
 * @property {function(string): Promise<boolean>} delete - Delete file by path
 * @property {function(string): Promise<boolean>} exists - Check if file exists
 */

/**
 * Abstraction layer for file attachment storage
 */
export class FileStorage {
  /**
   * @private
   * @type {StorageBackend}
   */
  #backend;

  /**
   * @private
   * @type {Map<string, FileMetadata>}
   */
  #metadata;

  /**
   * @private
   * @type {number}
   */
  #maxFileSize;

  /**
   * @private
   * @type {string[]}
   */
  #allowedMimeTypes;

  /**
   * Creates a new FileStorage instance
   * @param {StorageBackend} backend - Storage backend implementation
   * @param {Object} [options] - Configuration options
   * @param {number} [options.maxFileSize=10485760] - Max file size in bytes (default 10MB)
   * @param {string[]} [options.allowedMimeTypes] - Allowed MIME types (default all)
   */
  constructor(backend, options = {}) {
    if (!backend) {
      throw new Error('Storage backend is required');
    }

    this.#backend = backend;
    this.#metadata = new Map();
    this.#maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB default
    this.#allowedMimeTypes = options.allowedMimeTypes ?? [];
  }

  /**
   * Generate unique file ID
   * @private
   * @returns {string}
   */
  #generateId() {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate SHA-256 hash of buffer
   * @private
   * @param {Buffer} buffer - File buffer
   * @returns {string} Hex hash
   */
  #calculateHash(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validate file before storage
   * @private
   * @param {string} mimeType - MIME type
   * @param {number} size - File size
   * @throws {Error} If validation fails
   */
  #validateFile(mimeType, size) {
    if (size > this.#maxFileSize) {
      throw new Error(
        `File size ${size} exceeds maximum allowed ${this.#maxFileSize}`
      );
    }

    if (this.#allowedMimeTypes.length > 0 && !this.#allowedMimeTypes.includes(mimeType)) {
      throw new Error(`MIME type ${mimeType} is not allowed`);
    }
  }

  /**
   * Sanitize filename
   * @private
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  #sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  }

  /**
   * Upload a file attachment
   * @param {Object} params - Upload parameters
   * @param {string} params.taskId - Associated task ID
   * @param {string} params.filename - Original filename
   * @param {string} params.mimeType - MIME type
   * @param {Buffer} params.buffer - File data
   * @param {string} params.uploadedBy - Uploader user ID
   * @param {Object} [params.metadata] - Additional metadata
   * @returns {Promise<FileMetadata>} File metadata
   * @throws {Error} If upload fails validation
   */
  async upload(params) {
    const { taskId, filename, mimeType, buffer, uploadedBy, metadata = {} } = params;

    if (!taskId || !filename || !mimeType || !buffer || !uploadedBy) {
      throw new Error('Missing required upload parameters');
    }

    this.#validateFile(mimeType, buffer.length);

    const hash = this.#calculateHash(buffer);
    const sanitizedName = this.#sanitizeFilename(filename);
    const storagePath = `${taskId}/${hash.substring(0, 8)}_${sanitizedName}`;

    // Store file in backend
    const storedPath = await this.#backend.store(storagePath, buffer);

    const fileMeta = {
      id: this.#generateId(),
      originalName: filename,
      mimeType,
      size: buffer.length,
      hash,
      storagePath: storedPath,
      createdAt: new Date().toISOString(),
      uploadedBy,
      taskId,
      metadata
    };

    this.#metadata.set(fileMeta.id, fileMeta);

    return fileMeta;
  }

  /**
   * Download a file attachment
   * @param {string} fileId - File ID
   * @returns {Promise<{metadata: FileMetadata, buffer: Buffer}>}
   * @throws {Error} If file not found
   */
  async download(fileId) {
    const metadata = this.#metadata.get(fileId);
    if (!metadata) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await this.#backend.retrieve(metadata.storagePath);
    
    // Verify integrity
    const currentHash = this.#calculateHash(buffer);
    if (currentHash !== metadata.hash) {
      throw new Error('File integrity check failed');
    }

    return { metadata, buffer };
  }

  /**
   * Delete a file attachment
   * @param {string} fileId - File ID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(fileId) {
    const metadata = this.#metadata.get(fileId);
    if (!metadata) {
      return false;
    }

    const deleted = await this.#backend.delete(metadata.storagePath);
    if (deleted) {
      this.#metadata.delete(fileId);
    }

    return deleted;
  }

  /**
   * Get file metadata without downloading
   * @param {string} fileId - File ID
   * @returns {FileMetadata|undefined}
   */
  getMetadata(fileId) {
    return this.#metadata.get(fileId);
  }

  /**
   * List files for a task
   * @param {string} taskId - Task ID
   * @returns {FileMetadata[]}
   */
  listByTask(taskId) {
    return Array.from(this.#metadata.values())
      .filter(meta => meta.taskId === taskId);
  }

  /**
   * Check if file exists
   * @param {string} fileId - File ID
   * @returns {Promise<boolean>}
   */
  async exists(fileId) {
    const metadata = this.#metadata.get(fileId);
    if (!metadata) {
      return false;
    }

    return this.#backend.exists(metadata.storagePath);
  }

  /**
   * Get total storage used by a task
   * @param {string} taskId - Task ID
   * @returns {number} Total bytes
   */
  getTaskStorageSize(taskId) {
    return this.listByTask(taskId)
      .reduce((total, meta) => total + meta.size, 0);
  }

  /**
   * Copy file to another task
   * @param {string} fileId - Source file ID
   * @param {string} targetTaskId - Target task ID
   * @param {string} copiedBy - User performing the copy
   * @returns {Promise<FileMetadata>} New file metadata
   */
  async copyToTask(fileId, targetTaskId, copiedBy) {
    const { metadata, buffer } = await this.download(fileId);
    
    return this.upload({
      taskId: targetTaskId,
      filename: metadata.originalName,
      mimeType: metadata.mimeType,
      buffer,
      uploadedBy: copiedBy,
      metadata: {
        ...metadata.metadata,
        copiedFrom: fileId,
        originalUpload: metadata.createdAt
      }
    });
  }
}

/**
 * In-memory storage backend for testing
 */
export class InMemoryStorageBackend {
  /**
   * @private
   * @type {Map<string, Buffer>}
   */
  #storage = new Map();

  /**
   * Store file
   * @param {string} path - Storage path
   * @param {Buffer} data - File data
   * @returns {Promise<string>} Storage path
   */
  async store(path, data) {
    this.#storage.set(path, Buffer.from(data));
    return path;
  }

  /**
   * Retrieve file
   * @param {string} path - Storage path
   * @returns {Promise<Buffer>} File data
   * @throws {Error} If file not found
   */
  async retrieve(path) {
    const data = this.#storage.get(path);
    if (!data) {
      throw new Error(`File not found: ${path}`);
    }
    return data;
  }

  /**
   * Delete file
   * @param {string} path - Storage path
   * @returns {Promise<boolean>}
   */
  async delete(path) {
    return this.#storage.delete(path);
  }

  /**
   * Check if file exists
   * @param {string} path - Storage path
   * @returns {Promise<boolean>}
   */
  async exists(path) {
    return this.#storage.has(path);
  }

  /**
   * Clear all stored files
   */
  clear() {
    this.#storage.clear();
  }
}

export default FileStorage;
