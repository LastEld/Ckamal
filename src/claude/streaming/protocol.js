/**
 * @fileoverview Stream Protocol Handler for CogniMesh v5.0
 * Handles frame encoding/decoding, message types, and compression
 * @module claude/streaming/protocol
 */

/**
 * Protocol version
 * @constant {string}
 */
export const PROTOCOL_VERSION = '5.0.0';

/**
 * Message types for stream communication
 * @enum {string}
 */
export const MessageType = {
  DELTA: 'delta',
  ERROR: 'error',
  DONE: 'done',
  PING: 'ping',
  PONG: 'pong',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
};

/**
 * Frame structure:
 * {
 *   version: string,
 *   type: MessageType,
 *   sequence: number,
 *   timestamp: number,
 *   payload: object,
 *   compression?: 'none' | 'gzip',
 *   checksum?: string
 * }
 */

/**
 * Stream Protocol handler for encoding/decoding frames
 * @class StreamProtocol
 */
export class StreamProtocol {
  /**
   * Create a StreamProtocol instance
   * @param {Object} options - Protocol options
   * @param {string} [options.version=PROTOCOL_VERSION] - Protocol version
   * @param {boolean} [options.compression=false] - Enable compression
   * @param {number} [options.maxPayloadSize=1048576] - Max payload size in bytes (1MB)
   */
  constructor(options = {}) {
    /** @type {string} */
    this.version = options.version || PROTOCOL_VERSION;
    /** @type {boolean} */
    this.compression = options.compression || false;
    /** @type {number} */
    this.maxPayloadSize = options.maxPayloadSize || 1048576;
    /** @type {number} */
    this._sequence = 0;
    /** @type {boolean} */
    this._closed = false;
  }

  /**
   * Get next sequence number
   * @returns {number}
   * @private
   */
  _nextSequence() {
    return ++this._sequence;
  }

  /**
   * Generate checksum for payload validation
   * @param {string} data - Data to checksum
   * @returns {string}
   * @private
   */
  _generateChecksum(data) {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Compress data using CompressionStream if available
   * @param {string} data - Data to compress
   * @returns {Promise<Uint8Array>}
   * @private
   */
  async _compress(data) {
    if (typeof CompressionStream === 'undefined') {
      return new TextEncoder().encode(data);
    }
    
    const encoder = new TextEncoder();
    const input = encoder.encode(data);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(input);
    writer.close();
    
    const reader = cs.readable.getReader();
    const chunks = [];
    let result;
    while (!(result = await reader.read()).done) {
      chunks.push(result.value);
    }
    
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const compressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }
    
    return compressed;
  }

  /**
   * Decompress data using DecompressionStream if available
   * @param {Uint8Array} data - Data to decompress
   * @returns {Promise<string>}
   * @private
   */
  async _decompress(data) {
    if (typeof DecompressionStream === 'undefined') {
      return new TextDecoder().decode(data);
    }
    
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks = [];
    let result;
    while (!(result = await reader.read()).done) {
      chunks.push(result.value);
    }
    
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }
    
    return new TextDecoder().decode(decompressed);
  }

  /**
   * Encode a message frame
   * @param {MessageType} type - Message type
   * @param {Object} payload - Message payload
   * @returns {Promise<string|Uint8Array>} Encoded frame
   * @throws {Error} If protocol is closed or payload exceeds max size
   */
  async encode(type, payload) {
    if (this._closed) {
      throw new Error('Protocol instance is closed');
    }

    if (!Object.values(MessageType).includes(type)) {
      throw new Error(`Invalid message type: ${type}`);
    }

    const frame = {
      version: this.version,
      type,
      sequence: this._nextSequence(),
      timestamp: Date.now(),
      payload,
    };

    const jsonPayload = JSON.stringify(payload);
    
    if (jsonPayload.length > this.maxPayloadSize) {
      throw new Error(`Payload size ${jsonPayload.length} exceeds maximum ${this.maxPayloadSize}`);
    }

    // Add checksum for integrity
    frame.checksum = this._generateChecksum(jsonPayload);

    let encoded;
    
    if (this.compression && jsonPayload.length > 1024) {
      frame.compression = 'gzip';
      const jsonFrame = JSON.stringify(frame);
      encoded = await this._compress(jsonFrame);
    } else {
      frame.compression = 'none';
      encoded = JSON.stringify(frame);
    }

    return encoded;
  }

  /**
   * Decode a message frame
   * @param {string|Uint8Array|ArrayBuffer} data - Raw frame data
   * @returns {Promise<Object>} Decoded frame
   * @throws {Error} If frame is invalid or checksum fails
   */
  async decode(data) {
    if (this._closed) {
      throw new Error('Protocol instance is closed');
    }

    let raw;
    
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      // Try to decompress first
      try {
        raw = await this._decompress(bytes);
      } catch {
        raw = new TextDecoder().decode(bytes);
      }
    } else {
      raw = data;
    }

    let frame;
    try {
      frame = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON frame: ${err.message}`);
    }

    // Validate frame structure
    if (!frame.version || !frame.type || frame.sequence === undefined || !frame.payload) {
      throw new Error('Invalid frame structure');
    }

    // Validate checksum if present
    if (frame.checksum) {
      const payloadJson = JSON.stringify(frame.payload);
      const expectedChecksum = this._generateChecksum(payloadJson);
      if (frame.checksum !== expectedChecksum) {
        throw new Error('Frame checksum mismatch');
      }
    }

    // Validate protocol version (allow minor version differences)
    const [major, minor] = frame.version.split('.').map(Number);
    const [expectedMajor] = this.version.split('.').map(Number);
    
    if (major !== expectedMajor) {
      throw new Error(`Protocol version mismatch: expected ${expectedMajor}.x, got ${frame.version}`);
    }

    return frame;
  }

  /**
   * Encode a delta message (content chunk)
   * @param {Object} delta - Delta content
   * @param {string} [delta.type='text'] - Content type (text, thinking, etc.)
   * @param {string} delta.content - Content data
   * @param {Object} [delta.metadata] - Additional metadata
   * @returns {Promise<string|Uint8Array>} Encoded delta frame
   */
  encodeDelta(delta) {
    const payload = {
      type: delta.type || 'text',
      content: delta.content,
      metadata: delta.metadata || {},
    };
    return this.encode(MessageType.DELTA, payload);
  }

  /**
   * Encode an error message
   * @param {Error|string} error - Error object or message
   * @param {string} [code='STREAM_ERROR'] - Error code
   * @param {Object} [details] - Additional error details
   * @returns {Promise<string|Uint8Array>} Encoded error frame
   */
  encodeError(error, code = 'STREAM_ERROR', details = {}) {
    const payload = {
      code,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      details,
    };
    return this.encode(MessageType.ERROR, payload);
  }

  /**
   * Encode a done message (stream completion)
   * @param {Object} [metadata] - Completion metadata
   * @param {string} [metadata.finishReason='stop'] - Reason for finishing
   * @param {Object} [metadata.usage] - Token usage stats
   * @returns {Promise<string|Uint8Array>} Encoded done frame
   */
  encodeDone(metadata = {}) {
    const payload = {
      finishReason: metadata.finishReason || 'stop',
      usage: metadata.usage || null,
      timestamp: Date.now(),
    };
    return this.encode(MessageType.DONE, payload);
  }

  /**
   * Encode a ping message
   * @returns {Promise<string|Uint8Array>} Encoded ping frame
   */
  encodePing() {
    return this.encode(MessageType.PING, { timestamp: Date.now() });
  }

  /**
   * Encode a pong message
   * @param {number} pingTimestamp - Timestamp from ping
   * @returns {Promise<string|Uint8Array>} Encoded pong frame
   */
  encodePong(pingTimestamp) {
    return this.encode(MessageType.PONG, { 
      pingTimestamp,
      timestamp: Date.now(),
    });
  }

  /**
   * Encode a connect message
   * @param {string} conversationId - Conversation ID
   * @param {Object} [auth] - Authentication data
   * @returns {Promise<string|Uint8Array>} Encoded connect frame
   */
  encodeConnect(conversationId, auth = {}) {
    const payload = {
      conversationId,
      auth,
      clientVersion: PROTOCOL_VERSION,
    };
    return this.encode(MessageType.CONNECT, payload);
  }

  /**
   * Encode a disconnect message
   * @param {string} [reason='client_disconnect'] - Disconnect reason
   * @returns {Promise<string|Uint8Array>} Encoded disconnect frame
   */
  encodeDisconnect(reason = 'client_disconnect') {
    return this.encode(MessageType.DISCONNECT, { reason });
  }

  /**
   * Get current protocol version
   * @returns {string}
   */
  getVersion() {
    return this.version;
  }

  /**
   * Check if compression is enabled
   * @returns {boolean}
   */
  isCompressionEnabled() {
    return this.compression;
  }

  /**
   * Close the protocol instance
   */
  close() {
    this._closed = true;
  }

  /**
   * Check if protocol instance is closed
   * @returns {boolean}
   */
  isClosed() {
    return this._closed;
  }
}

/**
 * Create a new StreamProtocol instance
 * @param {Object} options - Protocol options
 * @returns {StreamProtocol}
 */
export function createProtocol(options = {}) {
  return new StreamProtocol(options);
}

export default StreamProtocol;
