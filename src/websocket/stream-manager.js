/**
 * @fileoverview Stream Manager with multiplexing and backpressure handling
 * @module websocket/stream-manager
 */

import { EventEmitter } from 'events';
import { Readable, Writable, Transform, pipeline } from 'stream';

/**
 * @typedef {Object} StreamConfig
 * @property {number} [highWaterMark=16384] - High water mark for backpressure
 * @property {number} [maxStreams=100] - Maximum number of concurrent streams
 * @property {number} [chunkSize=4096] - Default chunk size
 * @property {number} [retryAttempts=3] - Number of retry attempts on error
 * @property {number} [retryDelay=1000] - Delay between retries in ms
 */

/**
 * @typedef {Object} ManagedStream
 * @property {string} id - Stream ID
 * @property {string} type - Stream type ('source', 'sink', 'transform')
 * @property {Readable|Writable|Transform} stream - The underlying stream
 * @property {string} [room] - Associated room for multiplexing
 * @property {boolean} isActive - Whether the stream is active
 * @property {number} bytesProcessed - Bytes processed
 * @property {Date} createdAt - Stream creation time
 * @property {Function} cleanup - Cleanup function
 */

/**
 * Stream Manager for handling multiple streams with backpressure and multiplexing
 * @extends {EventEmitter}
 */
export class StreamManager extends EventEmitter {
  /** @type {Map<string, ManagedStream>} */
  #streams;

  /** @type {Map<string, Set<string>>} */
  #roomStreams;

  /** @type {StreamConfig} */
  #config;

  /** @type {boolean} */
  #isShutdown;

  /**
   * Creates a StreamManager instance
   * @param {StreamConfig} [config={}] - Stream configuration
   */
  constructor(config = {}) {
    super();

    this.#config = {
      highWaterMark: 16384,
      maxStreams: 100,
      chunkSize: 4096,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.#streams = new Map();
    this.#roomStreams = new Map();
    this.#isShutdown = false;
  }

  /**
   * Generates unique stream ID
   * @returns {string} Stream ID
   * @private
   */
  #generateId() {
    return `stream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Registers a stream in the manager
   * @param {Readable|Writable|Transform} stream - The stream to register
   * @param {Object} [options={}] - Registration options
   * @param {string} [options.type='source'] - Stream type
   * @param {string} [options.room] - Associated room
   * @param {Function} [options.onData] - Data handler
   * @param {Function} [options.onError] - Error handler
   * @param {Function} [options.onEnd] - End handler
   * @returns {string} Stream ID
   */
  register(stream, options = {}) {
    if (this.#isShutdown) {
      throw new Error('StreamManager is shutdown');
    }

    if (this.#streams.size >= this.#config.maxStreams) {
      throw new Error('Maximum number of streams reached');
    }

    const {
      type = 'source',
      room,
      onData,
      onError,
      onEnd,
    } = options;

    const id = this.#generateId();

    const managedStream = {
      id,
      type,
      stream,
      room,
      isActive: true,
      bytesProcessed: 0,
      createdAt: new Date(),
      cleanup: null,
    };

    this.#setupStreamHandlers(managedStream, { onData, onError, onEnd });
    this.#streams.set(id, managedStream);

    if (room) {
      if (!this.#roomStreams.has(room)) {
        this.#roomStreams.set(room, new Set());
      }
      this.#roomStreams.get(room).add(id);
    }

    this.emit('stream:registered', { id, type, room });

    return id;
  }

  /**
   * Sets up stream event handlers
   * @param {ManagedStream} managedStream - Managed stream object
   * @param {Object} handlers - Event handlers
   * @private
   */
  #setupStreamHandlers(managedStream, handlers) {
    const { stream, id } = managedStream;
    const { onData, onError, onEnd } = handlers;

    const handleError = async (error) => {
      managedStream.isActive = false;
      this.emit('stream:error', { id, error });

      if (onError) {
        onError(error);
      }

      await this.#attemptRecovery(managedStream, error);
    };

    const handleEnd = () => {
      managedStream.isActive = false;
      this.emit('stream:end', { id });

      if (onEnd) {
        onEnd();
      }
    };

    const handleData = (chunk) => {
      managedStream.bytesProcessed += chunk.length;
      this.emit('stream:data', { id, bytes: chunk.length });

      if (onData) {
        onData(chunk);
      }
    };

    stream.on('error', handleError);

    if (stream instanceof Readable) {
      stream.on('data', handleData);
      stream.on('end', handleEnd);
    }

    if (stream instanceof Writable) {
      stream.on('finish', handleEnd);
    }

    managedStream.cleanup = () => {
      stream.removeListener('error', handleError);
      if (stream instanceof Readable) {
        stream.removeListener('data', handleData);
        stream.removeListener('end', handleEnd);
      }
      if (stream instanceof Writable) {
        stream.removeListener('finish', handleEnd);
      }
    };
  }

  /**
   * Attempts to recover from stream errors
   * @param {ManagedStream} managedStream - Managed stream
   * @param {Error} error - The error that occurred
   * @private
   */
  async #attemptRecovery(managedStream, error) {
    let attempts = 0;

    while (attempts < this.#config.retryAttempts && managedStream.isActive === false) {
      attempts++;
      this.emit('stream:retry', { id: managedStream.id, attempt: attempts });

      await this.#delay(this.#config.retryDelay * attempts);

      try {
        if (managedStream.stream.readable && !managedStream.stream.destroyed) {
          managedStream.isActive = true;
          this.emit('stream:recovered', { id: managedStream.id });
          return;
        }
      } catch (retryError) {
        // Continue to next attempt
      }
    }

    this.unregister(managedStream.id);
  }

  /**
   * Creates a delay promise
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   * @private
   */
  #delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Unregisters a stream
   * @param {string} id - Stream ID
   * @returns {boolean} Whether the stream was unregistered
   */
  unregister(id) {
    const managedStream = this.#streams.get(id);
    if (!managedStream) {
      return false;
    }

    const { room, stream, cleanup } = managedStream;

    if (cleanup) {
      cleanup();
    }

    if (!stream.destroyed) {
      stream.destroy();
    }

    if (room) {
      const roomSet = this.#roomStreams.get(room);
      if (roomSet) {
        roomSet.delete(id);
        if (roomSet.size === 0) {
          this.#roomStreams.delete(room);
        }
      }
    }

    this.#streams.delete(id);
    this.emit('stream:unregistered', { id });

    return true;
  }

  /**
   * Gets a managed stream by ID
   * @param {string} id - Stream ID
   * @returns {ManagedStream|undefined} The managed stream
   */
  getStream(id) {
    return this.#streams.get(id);
  }

  /**
   * Checks if a stream exists
   * @param {string} id - Stream ID
   * @returns {boolean} Whether the stream exists
   */
  hasStream(id) {
    return this.#streams.has(id);
  }

  /**
   * Gets all active streams
   * @returns {ManagedStream[]} Array of managed streams
   */
  getAllStreams() {
    return Array.from(this.#streams.values());
  }

  /**
   * Gets streams by room
   * @param {string} room - Room name
   * @returns {ManagedStream[]} Array of managed streams in the room
   */
  getStreamsByRoom(room) {
    const streamIds = this.#roomStreams.get(room);
    if (!streamIds) return [];

    return Array.from(streamIds)
      .map((id) => this.#streams.get(id))
      .filter(Boolean);
  }

  /**
   * Gets all room names
   * @returns {string[]} Array of room names
   */
  getRooms() {
    return Array.from(this.#roomStreams.keys());
  }

  /**
   * Creates a multiplexed stream for a room
   * @param {string} room - Room name
   * @param {Object} [options={}] - Options
   * @param {Function} [options.transform] - Transform function
   * @returns {Transform} Multiplexed transform stream
   */
  createMultiplexer(room, options = {}) {
    const { transform } = options;

    const multiplexer = new Transform({
      highWaterMark: this.#config.highWaterMark,
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          if (transform) {
            const result = transform(chunk, encoding);
            callback(null, result);
          } else {
            callback(null, chunk);
          }
        } catch (error) {
          callback(error);
        }
      },
    });

    const id = this.register(multiplexer, {
      type: 'transform',
      room,
    });

    multiplexer.on('end', () => {
      this.unregister(id);
    });

    return multiplexer;
  }

  /**
   * Pipes a source stream to multiple destination streams with backpressure handling
   * @param {string} sourceId - Source stream ID
   * @param {string[]} destinationIds - Destination stream IDs
   * @param {Object} [options={}] - Pipe options
   * @returns {Promise<void>}
   */
  async multiplex(sourceId, destinationIds, options = {}) {
    const source = this.getStream(sourceId);
    if (!source || !(source.stream instanceof Readable)) {
      throw new Error('Invalid source stream');
    }

    const destinations = destinationIds
      .map((id) => this.getStream(id))
      .filter((s) => s && s.stream instanceof Writable);

    if (destinations.length === 0) {
      throw new Error('No valid destination streams');
    }

    const { end = true, signal } = options;

    return new Promise((resolve, reject) => {
      const streams = [source.stream, ...destinations.map((d) => d.stream)];

      const transformStreams = destinations.map((dest) => {
        return new Transform({
          highWaterMark: this.#config.highWaterMark,
          transform(chunk, encoding, callback) {
            const canContinue = dest.stream.write(chunk, encoding);
            if (!canContinue) {
              source.stream.pause();
              dest.stream.once('drain', () => {
                source.stream.resume();
              });
            }
            callback();
          },
        });
      });

      const pipelineStreams = [source.stream];
      for (const ts of transformStreams) {
        pipelineStreams.push(ts);
      }
      pipelineStreams.push(...destinations.map((d) => d.stream));

      pipeline(pipelineStreams, { signal }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Pipes source to destination with backpressure handling
   * @param {string} sourceId - Source stream ID
   * @param {string} destinationId - Destination stream ID
   * @param {Object} [options={}] - Pipe options
   * @returns {Promise<void>}
   */
  async pipe(sourceId, destinationId, options = {}) {
    const source = this.getStream(sourceId);
    const destination = this.getStream(destinationId);

    if (!source || !(source.stream instanceof Readable)) {
      throw new Error('Invalid source stream');
    }

    if (!destination || !(destination.stream instanceof Writable)) {
      throw new Error('Invalid destination stream');
    }

    const { end = true, signal } = options;

    return new Promise((resolve, reject) => {
      source.stream.pipe(destination.stream, { end });

      const handleError = (err) => {
        cleanup();
        reject(err);
      };

      const handleFinish = () => {
        cleanup();
        resolve();
      };

      const handleAbort = () => {
        cleanup();
        reject(new Error('Pipe aborted'));
      };

      const cleanup = () => {
        source.stream.removeListener('error', handleError);
        destination.stream.removeListener('error', handleError);
        destination.stream.removeListener('finish', handleFinish);
        if (signal) {
          signal.removeEventListener('abort', handleAbort);
        }
      };

      source.stream.once('error', handleError);
      destination.stream.once('error', handleError);
      destination.stream.once('finish', handleFinish);

      if (signal) {
        signal.addEventListener('abort', handleAbort);
      }
    });
  }

  /**
   * Creates a backpressure-aware writable stream
   * @param {Function} writeFn - Write function
   * @param {Object} [options={}] - Options
   * @returns {Writable} Writable stream
   */
  createWritableStream(writeFn, options = {}) {
    const { highWaterMark = this.#config.highWaterMark } = options;

    return new Writable({
      highWaterMark,
      write(chunk, encoding, callback) {
        try {
          Promise.resolve(writeFn(chunk, encoding))
            .then(() => callback())
            .catch(callback);
        } catch (error) {
          callback(error);
        }
      },
    });
  }

  /**
   * Creates a chunked readable stream
   * @param {Buffer|string} data - Data to stream
   * @param {Object} [options={}] - Options
   * @returns {string} Stream ID
   */
  createChunkedStream(data, options = {}) {
    const { chunkSize = this.#config.chunkSize, room } = options;

    let offset = 0;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    const stream = new Readable({
      highWaterMark: this.#config.highWaterMark,
      read() {
        if (offset >= buffer.length) {
          this.push(null);
          return;
        }

        const end = Math.min(offset + chunkSize, buffer.length);
        const chunk = buffer.slice(offset, end);
        offset = end;

        this.push(chunk);
      },
    });

    return this.register(stream, { type: 'source', room });
  }

  /**
   * Checks backpressure status for a stream
   * @param {string} id - Stream ID
   * @returns {boolean|undefined} Whether the stream is experiencing backpressure
   */
  isBackpressured(id) {
    const managedStream = this.#streams.get(id);
    if (!managedStream) return undefined;

    const { stream } = managedStream;

    if (stream instanceof Writable) {
      return stream.writableNeedDrain;
    }

    return false;
  }

  /**
   * Waits for backpressure to clear
   * @param {string} id - Stream ID
   * @returns {Promise<void>}
   */
  async waitForDrain(id) {
    const managedStream = this.#streams.get(id);
    if (!managedStream || !(managedStream.stream instanceof Writable)) {
      return;
    }

    if (!managedStream.stream.writableNeedDrain) {
      return;
    }

    return new Promise((resolve) => {
      managedStream.stream.once('drain', resolve);
    });
  }

  /**
   * Gets stream statistics
   * @param {string} [id] - Stream ID (if omitted, returns global stats)
   * @returns {Object} Statistics
   */
  getStats(id) {
    if (id) {
      const stream = this.#streams.get(id);
      if (!stream) return null;

      return {
        id: stream.id,
        type: stream.type,
        room: stream.room,
        isActive: stream.isActive,
        bytesProcessed: stream.bytesProcessed,
        createdAt: stream.createdAt,
        age: Date.now() - stream.createdAt.getTime(),
      };
    }

    const streams = this.getAllStreams();
    const totalBytes = streams.reduce((sum, s) => sum + s.bytesProcessed, 0);

    return {
      totalStreams: streams.length,
      activeStreams: streams.filter((s) => s.isActive).length,
      totalRooms: this.#roomStreams.size,
      totalBytesProcessed: totalBytes,
      byType: {
        source: streams.filter((s) => s.type === 'source').length,
        sink: streams.filter((s) => s.type === 'sink').length,
        transform: streams.filter((s) => s.type === 'transform').length,
      },
    };
  }

  /**
   * Gracefully shuts down all streams
   * @param {Object} [options={}] - Shutdown options
   * @param {number} [options.timeout=30000] - Shutdown timeout in ms
   * @returns {Promise<void>}
   */
  async shutdown(options = {}) {
    const { timeout = 30000 } = options;

    if (this.#isShutdown) {
      return;
    }

    this.#isShutdown = true;
    this.emit('shutdown:start');

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout')), timeout);
    });

    const shutdownPromise = (async () => {
      const streams = this.getAllStreams();

      for (const managedStream of streams) {
        try {
          await this.#closeStream(managedStream);
        } catch (error) {
          this.emit('shutdown:error', { id: managedStream.id, error });
        }
      }

      this.#streams.clear();
      this.#roomStreams.clear();
    })();

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
      this.emit('shutdown:complete');
    } catch (error) {
      this.emit('shutdown:timeout', error);
      throw error;
    }
  }

  /**
   * Gracefully closes a stream
   * @param {ManagedStream} managedStream - Stream to close
   * @returns {Promise<void>}
   * @private
   */
  async #closeStream(managedStream) {
    const { stream, cleanup } = managedStream;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('Stream close timeout'));
      }, 5000);

      const handleClose = () => {
        clearTimeout(timeout);
        cleanup();
        resolve();
      };

      const handleError = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      stream.once('close', handleClose);
      stream.once('error', handleError);

      if (stream instanceof Writable && !stream.writableEnded) {
        stream.end();
      } else if (stream instanceof Readable && !stream.readableEnded) {
        stream.push(null);
      } else {
        stream.destroy();
      }
    });
  }

  /**
   * Checks if the manager is shutdown
   * @returns {boolean} Shutdown status
   */
  isShutdown() {
    return this.#isShutdown;
  }
}

export default StreamManager;
