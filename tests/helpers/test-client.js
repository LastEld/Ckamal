/**
 * @fileoverview Test client utilities
 * Provides HTTP and WebSocket clients for testing
 */

import { request } from 'node:http';
import { WebSocket } from 'ws';

/**
 * Create an HTTP test client
 * @param {string} baseUrl - Base URL for requests
 * @param {Object} defaultOptions - Default request options
 * @returns {Object} Test client with HTTP methods
 */
export function createTestClient(baseUrl, defaultOptions = {}) {
  const parsedUrl = new URL(baseUrl);
  const cookies = new Map();
  
  /**
   * Make an HTTP request
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {any} data - Request body
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async function makeRequest(method, path, data = null, options = {}) {
    const mergedOptions = { ...defaultOptions, ...options };
    const headers = { ...mergedOptions.headers };
    
    // Handle cookies
    if (mergedOptions.keepCookies && cookies.size > 0) {
      headers['Cookie'] = Array.from(cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    }
    
    // Set content type for JSON
    if (data && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    
    // Build request body
    let body = null;
    if (data) {
      body = typeof data === 'string' ? data : JSON.stringify(data);
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    
    return new Promise((resolve, reject) => {
      const req = request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: path,
        method: method.toUpperCase(),
        headers
      }, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          // Parse cookies from response
          const setCookie = res.headers['set-cookie'];
          if (setCookie && mergedOptions.keepCookies) {
            setCookie.forEach(cookie => {
              const [nameValue] = cookie.split(';');
              const [name, value] = nameValue.trim().split('=');
              cookies.set(name, value);
            });
          }
          
          // Parse response body
          let parsedData = responseData;
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            try {
              parsedData = JSON.parse(responseData);
            } catch (e) {
              // Keep as string if JSON parse fails
            }
          }
          
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData,
            raw: responseData
          });
        });
      });
      
      req.on('error', reject);
      
      if (body) {
        req.write(body);
      }
      
      req.end();
    });
  }
  
  return {
    /**
     * Make GET request
     */
    get(path, options = {}) {
      return makeRequest('GET', path, null, options);
    },
    
    /**
     * Make POST request
     */
    post(path, data, options = {}) {
      return makeRequest('POST', path, data, options);
    },
    
    /**
     * Make PUT request
     */
    put(path, data, options = {}) {
      return makeRequest('PUT', path, data, options);
    },
    
    /**
     * Make PATCH request
     */
    patch(path, data, options = {}) {
      return makeRequest('PATCH', path, data, options);
    },
    
    /**
     * Make DELETE request
     */
    delete(path, options = {}) {
      return makeRequest('DELETE', path, null, options);
    },
    
    /**
     * Make OPTIONS request
     */
    options(path, options = {}) {
      return makeRequest('OPTIONS', path, null, options);
    },
    
    /**
     * Make arbitrary request
     */
    request(method, path, data, options = {}) {
      return makeRequest(method, path, data, options);
    },
    
    /**
     * Set default header
     */
    setHeader(name, value) {
      defaultOptions.headers = defaultOptions.headers || {};
      defaultOptions.headers[name] = value;
      return this;
    },
    
    /**
     * Set authentication token
     */
    setAuthToken(token) {
      return this.setHeader('Authorization', `Bearer ${token}`);
    },
    
    /**
     * Enable cookie persistence
     */
    enableCookies() {
      defaultOptions.keepCookies = true;
      return this;
    },
    
    /**
     * Clear stored cookies
     */
    clearCookies() {
      cookies.clear();
      return this;
    },
    
    /**
     * Get stored cookies
     */
    getCookies() {
      return new Map(cookies);
    },
    
    /**
     * Set base URL
     */
    setBaseUrl(newBaseUrl) {
      const newParsed = new URL(newBaseUrl);
      parsedUrl.hostname = newParsed.hostname;
      parsedUrl.port = newParsed.port;
      parsedUrl.protocol = newParsed.protocol;
      return this;
    }
  };
}

/**
 * Create a WebSocket test client
 * @param {string} url - WebSocket URL
 * @param {Object} options - WebSocket options
 * @returns {WebSocket} Enhanced WebSocket instance
 */
export function createWebSocketClient(url, options = {}) {
  const ws = new WebSocket(url, options);
  
  // Track connection state
  let messageQueue = [];
  let isReady = false;
  
  ws.on('open', () => {
    isReady = true;
    // Flush queued messages
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      ws.send(msg);
    }
  });
  
  /**
   * Send message when connected (queues if not ready)
   * @param {any} data - Message data
   */
  ws.sendWhenReady = function(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    
    if (isReady) {
      this.send(message);
    } else {
      messageQueue.push(message);
    }
  };
  
  /**
   * Send JSON message
   * @param {any} data - Data to send
   */
  ws.sendJSON = function(data) {
    this.send(JSON.stringify(data));
  };
  
  /**
   * Wait for specific message type
   * @param {string} type - Message type to wait for
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Object>} Message data
   */
  ws.waitForMessage = function(type, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for message type: ${type}`));
      }, timeout);
      
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (!type || msg.type === type) {
            clearTimeout(timer);
            this.off('message', handler);
            resolve(msg);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      };
      
      this.on('message', handler);
    });
  };
  
  /**
   * Wait for connection to open
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<void>}
   */
  ws.waitForOpen = function(timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for WebSocket connection'));
      }, timeout);
      
      this.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      
      this.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  };
  
  /**
   * Wait for connection to close
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<{code: number, reason: string}>}
   */
  ws.waitForClose = function(timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.readyState === WebSocket.CLOSED) {
        resolve({ code: this.closeCode, reason: this.closeReason });
        return;
      }
      
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for WebSocket close'));
      }, timeout);
      
      this.once('close', (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
    });
  };
  
  /**
   * Collect messages over time
   * @param {Object} options - Collection options
   * @returns {Promise<Array>} Collected messages
   */
  ws.collectMessages = function({ 
    duration = 1000, 
    filter = null,
    maxMessages = Infinity 
  } = {}) {
    return new Promise((resolve) => {
      const messages = [];
      
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (!filter || filter(msg)) {
            messages.push(msg);
            if (messages.length >= maxMessages) {
              cleanup();
            }
          }
        } catch (e) {
          messages.push({ raw: data.toString() });
        }
      };
      
      const cleanup = () => {
        clearTimeout(timer);
        this.off('message', handler);
        resolve(messages);
      };
      
      this.on('message', handler);
      const timer = setTimeout(cleanup, duration);
    });
  };
  
  return ws;
}

/**
 * Create a pool of test clients for load testing
 * @param {string} baseUrl - Base URL
 * @param {number} size - Pool size
 * @returns {Object} Client pool
 */
export function createClientPool(baseUrl, size = 10) {
  const clients = Array.from({ length: size }, () => 
    createTestClient(baseUrl)
  );
  
  let currentIndex = 0;
  
  return {
    /**
     * Get next client (round-robin)
     */
    getClient() {
      const client = clients[currentIndex];
      currentIndex = (currentIndex + 1) % size;
      return client;
    },
    
    /**
     * Get all clients
     */
    getAll() {
      return [...clients];
    },
    
    /**
     * Execute function with all clients in parallel
     */
    async parallel(fn) {
      return Promise.all(clients.map((client, i) => fn(client, i)));
    },
    
    /**
     * Execute function with all clients sequentially
     */
    async sequential(fn) {
      const results = [];
      for (let i = 0; i < clients.length; i++) {
        results.push(await fn(clients[i], i));
      }
      return results;
    }
  };
}

/**
 * Create request builder for complex requests
 * @param {string} baseUrl - Base URL
 */
export function createRequestBuilder(baseUrl) {
  const builder = {
    method: 'GET',
    path: '/',
    headers: {},
    query: {},
    body: null,
    
    /**
     * Set HTTP method
     */
    setMethod(method) {
      this.method = method.toUpperCase();
      return this;
    },
    
    /**
     * Set request path
     */
    setPath(path) {
      this.path = path;
      return this;
    },
    
    /**
     * Set header
     */
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    
    /**
     * Set query parameter
     */
    setQuery(name, value) {
      this.query[name] = value;
      return this;
    },
    
    /**
     * Set request body
     */
    setBody(body) {
      this.body = body;
      return this;
    },
    
    /**
     * Set JSON body
     */
    setJSON(body) {
      this.body = body;
      this.headers['Content-Type'] = 'application/json';
      return this;
    },
    
    /**
     * Set form data
     */
    setFormData(data) {
      this.body = data;
      this.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      return this;
    },
    
    /**
     * Build and execute request
     */
    async execute() {
      const client = createTestClient(baseUrl);
      
      // Build URL with query params
      const queryString = Object.entries(this.query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      
      const fullPath = queryString 
        ? `${this.path}?${queryString}` 
        : this.path;
      
      // Set headers
      Object.entries(this.headers).forEach(([k, v]) => {
        client.setHeader(k, v);
      });
      
      return client.request(this.method, fullPath, this.body);
    }
  };
  
  // Convenience methods
  ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
    builder[method] = function(path) {
      this.setMethod(method);
      this.setPath(path);
      return this;
    };
  });
  
  return builder;
}

/**
 * Retry a request with exponential backoff
 * @param {Function} fn - Request function
 * @param {Object} options - Retry options
 * @returns {Promise<any>}
 */
export async function retryRequest(fn, options = {}) {
  const { 
    maxRetries = 3, 
    baseDelay = 100,
    maxDelay = 10000,
    retryableStatuses = [408, 429, 500, 502, 503, 504]
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      // Check if response status is retryable
      if (result.status && retryableStatuses.includes(result.status)) {
        throw new Error(`Retryable status: ${result.status}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        maxDelay
      );
      
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw lastError;
}

export default {
  createTestClient,
  createWebSocketClient,
  createClientPool,
  createRequestBuilder,
  retryRequest
};
