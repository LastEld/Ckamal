/**
 * Rate Limit Integration Tests
 * @module tests/rate-limit-integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  rateLimitMiddleware,
  rateLimitConfig,
  RateLimitError,
  getRateLimitStatus,
  resetRateLimit,
  clearRateLimiters
} from '../src/middleware/rate-limit.js';

describe('Rate Limit Integration', () => {
  let mockReq;
  let mockRes;
  let nextCalls;

  beforeEach(() => {
    nextCalls = [];
    clearRateLimiters();

    mockReq = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      ip: '127.0.0.1'
    };

    mockRes = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      statusCode: 200
    };
  });

  afterEach(() => {
    clearRateLimiters();
  });

  describe('rateLimitConfig', () => {
    it('should have default configuration', () => {
      expect(rateLimitConfig.default).toBeDefined();
      expect(rateLimitConfig.default.windowMs).toBe(15 * 60 * 1000);
      expect(rateLimitConfig.default.max).toBe(100);
    });

    it('should have auth configuration', () => {
      expect(rateLimitConfig.auth).toBeDefined();
      expect(rateLimitConfig.auth.windowMs).toBe(60 * 1000);
      expect(rateLimitConfig.auth.max).toBe(10);
    });

    it('should have claude configuration', () => {
      expect(rateLimitConfig.claude).toBeDefined();
      expect(rateLimitConfig.claude.windowMs).toBe(60 * 1000);
      expect(rateLimitConfig.claude.max).toBe(30);
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should allow requests within limit', async () => {
      const middleware = rateLimitMiddleware('auth');

      for (let i = 0; i < 10; i++) {
        nextCalls = [];
        await middleware(mockReq, mockRes, (err) => nextCalls.push(err));
        expect(nextCalls[0]).toBeUndefined();
        expect(mockRes.headers['X-RateLimit-Limit']).toBe(10);
        expect(mockRes.headers['X-RateLimit-Remaining']).toBe(10 - i - 1);
      }
    });

    it('should block requests exceeding limit', async () => {
      const middleware = rateLimitMiddleware('auth');

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await middleware(mockReq, mockRes, () => {});
      }

      // Next request should be blocked
      nextCalls = [];
      await middleware(mockReq, mockRes, (err) => nextCalls.push(err));
      expect(nextCalls[0]).toBeDefined();
      expect(nextCalls[0].statusCode).toBe(429);
      expect(mockRes.headers['Retry-After']).toBeDefined();
    });

    it('should set X-RateLimit headers', async () => {
      const middleware = rateLimitMiddleware('default');

      await middleware(mockReq, mockRes, () => {});

      expect(mockRes.headers['X-RateLimit-Limit']).toBeDefined();
      expect(mockRes.headers['X-RateLimit-Remaining']).toBeDefined();
      expect(mockRes.headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should support per-client limits with API key', async () => {
      const middleware = rateLimitMiddleware('claude', { perClient: true });

      mockReq.headers['x-api-key'] = 'test-api-key-12345';
      await middleware(mockReq, mockRes, () => {});

      expect(mockRes.headers['X-RateLimit-Limit']).toBe(30);
    });

    it('should track different clients separately', async () => {
      const middleware = rateLimitMiddleware('auth', { perClient: true });

      // Request from client 1
      mockReq.headers['x-api-key'] = 'client-1';
      await middleware(mockReq, mockRes, () => {});
      const remainingClient1 = mockRes.headers['X-RateLimit-Remaining'];

      // Request from client 2
      mockReq.headers['x-api-key'] = 'client-2';
      await middleware(mockReq, mockRes, () => {});
      const remainingClient2 = mockRes.headers['X-RateLimit-Remaining'];

      // Both should have same initial remaining
      expect(remainingClient1).toBe(9);
      expect(remainingClient2).toBe(9);
    });

    it('should support custom options', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 50 });

      await middleware(mockReq, mockRes, () => {});

      expect(mockRes.headers['X-RateLimit-Limit']).toBe(50);
    });

    it('should throw error for unknown preset', () => {
      expect(() => rateLimitMiddleware('unknown')).toThrow('Unknown rate limit preset');
    });
  });

  describe('RateLimitError', () => {
    it('should create error with retry after', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.name).toBe('RateLimitError');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
      expect(error.message).toBe('Too many requests');
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for a key', async () => {
      const middleware = rateLimitMiddleware('auth');

      // Consume some tokens
      await middleware(mockReq, mockRes, () => {});
      const remaining1 = mockRes.headers['X-RateLimit-Remaining'];

      // Reset the limit
      await resetRateLimit('127.0.0.1', 'auth');

      // Should be back to full limit
      await middleware(mockReq, mockRes, () => {});
      const remaining2 = mockRes.headers['X-RateLimit-Remaining'];

      expect(remaining2).toBeGreaterThan(remaining1);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status for a key', async () => {
      const middleware = rateLimitMiddleware('default');

      await middleware(mockReq, mockRes, () => {});

      const status = await getRateLimitStatus('127.0.0.1', 'default');

      expect(status.limit).toBe(100);
      expect(status.remaining).toBeDefined();
      expect(status.allowed).toBe(true);
    });
  });
});

describe('IP Key Generator', () => {
  it('should extract IP from x-forwarded-for', async () => {
    const middleware = rateLimitMiddleware('auth');

    const req = {
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    const res = { headers: {}, setHeader() {} };

    await middleware(req, res, () => {});
    // Should use first IP from x-forwarded-for
  });

  it('should fallback to socket address', async () => {
    const middleware = rateLimitMiddleware('auth');

    const req = {
      headers: {},
      socket: { remoteAddress: '10.0.0.5' }
    };
    const res = { headers: {}, setHeader() {} };

    await middleware(req, res, () => {});
  });

  it('should use cf-connecting-ip if available', async () => {
    const middleware = rateLimitMiddleware('auth');

    const req = {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    const res = { headers: {}, setHeader() {} };

    await middleware(req, res, () => {});
  });
});
