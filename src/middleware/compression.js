/**
 * @fileoverview Response Compression Middleware
 * @module middleware/compression
 * @description Brotli and Gzip compression for HTTP responses
 * @version 5.0.0
 */

import { createBrotliCompress, createGzip, constants as zlibConstants } from 'zlib';
import { promisify } from 'util';
import { PassThrough } from 'stream';

const brotliCompress = promisify(createBrotliCompress);

/**
 * Compression configuration
 * @typedef {Object} CompressionConfig
 * @property {number} [level=6] - Compression level (1-9 for gzip, 1-11 for brotli)
 * @property {number} [threshold=1024] - Minimum size to compress (bytes)
 * @property {string[]} [filter] - MIME types to compress
 * @property {boolean} [brotli=true] - Enable Brotli compression
 * @property {boolean} [gzip=true] - Enable Gzip compression
 * @property {boolean} [streaming=true] - Enable streaming compression
 */

/**
 * Default MIME types to compress
 * @const {string[]}
 */
const DEFAULT_COMPRESSIBLE_TYPES = [
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/xml',
  'application/json',
  'application/javascript',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
  'image/svg+xml',
  'application/vnd.api+json'
];

/**
 * Check if content type should be compressed
 * @param {string} contentType - Content-Type header value
 * @param {string[]} allowedTypes - Allowed MIME types
 * @returns {boolean}
 */
function shouldCompress(contentType, allowedTypes = DEFAULT_COMPRESSIBLE_TYPES) {
  if (!contentType) return false;
  
  const baseType = contentType.split(';')[0].trim().toLowerCase();
  
  return allowedTypes.some(type => {
    // Exact match
    if (type === baseType) return true;
    // Wildcard match (e.g., text/*)
    if (type.endsWith('/*')) {
      const prefix = type.slice(0, -1);
      return baseType.startsWith(prefix);
    }
    return false;
  });
}

/**
 * Check if request accepts compression
 * @param {string} acceptEncoding - Accept-Encoding header
 * @param {string} encoding - Encoding to check
 * @returns {boolean}
 */
function acceptsEncoding(acceptEncoding, encoding) {
  if (!acceptEncoding) return false;
  
  const encodings = acceptEncoding.toLowerCase().split(',').map(e => e.trim());
  return encodings.some(e => e === encoding || e.startsWith(`${encoding};`));
}

/**
 * Select best compression encoding
 * @param {string} acceptEncoding - Accept-Encoding header
 * @param {CompressionConfig} config
 * @returns {string|null}
 */
function selectEncoding(acceptEncoding, config) {
  if (!acceptEncoding) return null;
  
  // Prefer Brotli
  if (config.brotli && acceptsEncoding(acceptEncoding, 'br')) {
    return 'br';
  }
  
  // Fall back to gzip
  if (config.gzip && acceptsEncoding(acceptEncoding, 'gzip')) {
    return 'gzip';
  }
  
  // Deflate as last resort
  if (acceptsEncoding(acceptEncoding, 'deflate')) {
    return 'deflate';
  }
  
  return null;
}

/**
 * Create compression stream
 * @param {string} encoding - Encoding type
 * @param {number} level - Compression level
 * @returns {import('zlib').Gzip|import('zlib').BrotliCompress}
 */
function createCompressionStream(encoding, level) {
  switch (encoding) {
    case 'br':
      return createBrotliCompress({
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: Math.min(11, Math.max(1, level))
        }
      });
    case 'gzip':
      return createGzip({ level: Math.min(9, Math.max(1, level)) });
    case 'deflate':
      return createGzip({ level: Math.min(9, Math.max(1, level)) });
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }
}

/**
 * Compression middleware factory
 * @param {CompressionConfig} [options={}] - Compression options
 * @returns {Function} Express middleware
 */
export function compressionMiddleware(options = {}) {
  const config = {
    level: 6,
    threshold: 1024,
    filter: DEFAULT_COMPRESSIBLE_TYPES,
    brotli: true,
    gzip: true,
    streaming: true,
    ...options
  };

  return (req, res, next) => {
    // Skip if already compressed
    if (res.getHeader('Content-Encoding')) {
      return next();
    }

    // Check Accept-Encoding header
    const acceptEncoding = req.headers['accept-encoding'];
    const encoding = selectEncoding(acceptEncoding, config);
    
    if (!encoding) {
      return next();
    }

    // Store original methods
    const originalWrite = res.write;
    const originalEnd = res.end;
    let buffer = Buffer.alloc(0);
    let compressed = false;
    let stream = null;

    // Override write method
    res.write = function(chunk, encoding) {
      if (compressed) {
        return stream.write(chunk, encoding);
      }

      // Buffer the data
      if (chunk) {
        buffer = Buffer.concat([
          buffer,
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
        ]);
      }

      // Check if we should start compressing
      if (buffer.length >= config.threshold) {
        startCompression();
        if (buffer.length > 0) {
          stream.write(buffer);
          buffer = Buffer.alloc(0);
        }
      }

      return true;
    };

    // Override end method
    res.end = function(chunk, encoding) {
      if (compressed) {
        if (chunk) {
          stream.write(chunk, encoding);
        }
        stream.end();
        return;
      }

      // Add final chunk to buffer
      if (chunk) {
        buffer = Buffer.concat([
          buffer,
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
        ]);
      }

      // Check if we should compress
      const contentType = res.getHeader('Content-Type');
      const shouldCompressContent = shouldCompress(contentType, config.filter);
      
      if (!shouldCompressContent || buffer.length < config.threshold) {
        // Don't compress, send as-is
        res.write = originalWrite;
        res.end = originalEnd;
        return originalEnd.call(res, buffer);
      }

      // Compress and send
      const compressionStream = createCompressionStream(encoding, config.level);
      const chunks = [];

      compressionStream.on('data', (chunk) => chunks.push(chunk));
      compressionStream.on('end', () => {
        const compressedData = Buffer.concat(chunks);
        
        // Set compression headers
        res.setHeader('Content-Encoding', encoding);
        res.setHeader('Vary', 'Accept-Encoding');
        res.removeHeader('Content-Length');
        res.setHeader('Content-Length', compressedData.length);

        // Restore original methods
        res.write = originalWrite;
        res.end = originalEnd;
        
        originalEnd.call(res, compressedData);
      });

      compressionStream.on('error', (err) => {
        // On error, send uncompressed
        res.write = originalWrite;
        res.end = originalEnd;
        originalEnd.call(res, buffer);
      });

      compressionStream.end(buffer);
    };

    function startCompression() {
      if (compressed) return;

      const contentType = res.getHeader('Content-Type');
      if (!shouldCompress(contentType, config.filter)) {
        return;
      }

      compressed = true;
      
      // Set compression headers
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      res.removeHeader('Content-Length');

      // Create compression stream
      stream = createCompressionStream(encoding, config.level);
      
      const chunks = [];
      
      stream.on('data', (chunk) => {
        originalWrite.call(res, chunk);
      });

      stream.on('end', () => {
        originalEnd.call(res);
      });

      stream.on('error', (err) => {
        console.error('[Compression] Error:', err.message);
      });
    }

    next();
  };
}

/**
 * Pre-compressed static file middleware
 * Serves pre-compressed .br or .gz files if available
 * @param {Object} [options={}] - Options
 * @param {string} [options.dir='public'] - Static files directory
 * @returns {Promise<Function>} Express middleware
 */
export async function precompressedMiddleware(options = {}) {
  const { dir = 'public' } = options;
  const { stat, access } = await import('fs/promises');
  const { join } = await import('path');

  return async (req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'];
    if (!acceptEncoding) return next();

    const filePath = join(dir, req.path);
    
    try {
      let encoding = null;
      let compressedPath = null;

      // Check for Brotli version
      if (acceptsEncoding(acceptEncoding, 'br')) {
        const brPath = `${filePath}.br`;
        try {
          await access(brPath);
          encoding = 'br';
          compressedPath = brPath;
        } catch {
          // Brotli version not found
        }
      }

      // Check for Gzip version
      if (!encoding && acceptsEncoding(acceptEncoding, 'gzip')) {
        const gzPath = `${filePath}.gz`;
        try {
          await access(gzPath);
          encoding = 'gzip';
          compressedPath = gzPath;
        } catch {
          // Gzip version not found
        }
      }

      if (encoding && compressedPath) {
        const stats = await stat(compressedPath);
        
        res.setHeader('Content-Encoding', encoding);
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Last-Modified', stats.mtime.toUTCString());
        
        // Send the pre-compressed file
        const { createReadStream } = await import('fs');
        const stream = createReadStream(compressedPath);
        stream.pipe(res);
        return;
      }

      next();
    } catch {
      next();
    }
  };
}

/**
 * Compression statistics
 * @type {Object}
 */
const compressionStats = {
  totalRequests: 0,
  compressedRequests: 0,
  bytesBefore: 0,
  bytesAfter: 0,
  encodingCounts: {
    br: 0,
    gzip: 0,
    deflate: 0
  }
};

/**
 * Get compression statistics
 * @returns {Object}
 */
export function getCompressionStats() {
  const ratio = compressionStats.bytesBefore > 0
    ? (1 - compressionStats.bytesAfter / compressionStats.bytesBefore) * 100
    : 0;

  return {
    ...compressionStats,
    compressionRatio: ratio.toFixed(2) + '%',
    averageSavings: compressionStats.compressedRequests > 0
      ? Math.round((compressionStats.bytesBefore - compressionStats.bytesAfter) / compressionStats.compressedRequests)
      : 0
  };
}

/**
 * Reset compression statistics
 */
export function resetCompressionStats() {
  compressionStats.totalRequests = 0;
  compressionStats.compressedRequests = 0;
  compressionStats.bytesBefore = 0;
  compressionStats.bytesAfter = 0;
  compressionStats.encodingCounts = { br: 0, gzip: 0, deflate: 0 };
}

export default compressionMiddleware;
