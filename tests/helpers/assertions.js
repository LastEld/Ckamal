/**
 * @fileoverview Custom assertion helpers for tests
 * Extends Node.js assert with domain-specific assertions
 */

import assert from 'node:assert/strict';

/**
 * Assert that value is a valid UUID
 * @param {any} value - Value to check
 * @param {string} message - Error message
 */
export function assertUUID(value, message = 'Expected valid UUID') {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.ok(uuidRegex.test(value), message);
}

/**
 * Assert that value is a valid ISO 8601 date string
 * @param {any} value - Value to check
 * @param {string} message - Error message
 */
export function assertISODate(value, message = 'Expected valid ISO 8601 date') {
  const date = new Date(value);
  assert.ok(!isNaN(date.getTime()), message);
  assert.ok(typeof value === 'string' && value.includes('T'), message);
}

/**
 * Assert that object has all specified keys
 * @param {Object} obj - Object to check
 * @param {string[]} keys - Required keys
 * @param {string} message - Error message
 */
export function assertHasKeys(obj, keys, message) {
  assert.ok(obj !== null && typeof obj === 'object', 'Expected object');
  for (const key of keys) {
    assert.ok(key in obj, message || `Expected object to have key: ${key}`);
  }
}

/**
 * Assert that object has at least one of specified keys
 * @param {Object} obj - Object to check
 * @param {string[]} keys - Keys to check
 * @param {string} message - Error message
 */
export function assertHasAnyKey(obj, keys, message) {
  assert.ok(obj !== null && typeof obj === 'object', 'Expected object');
  const hasKey = keys.some(key => key in obj);
  assert.ok(hasKey, message || `Expected object to have at least one of: ${keys.join(', ')}`);
}

/**
 * Assert that value is within range
 * @param {number} value - Value to check
 * @param {number} min - Minimum (inclusive)
 * @param {number} max - Maximum (inclusive)
 * @param {string} message - Error message
 */
export function assertInRange(value, min, max, message) {
  assert.ok(
    typeof value === 'number' && value >= min && value <= max,
    message || `Expected ${value} to be in range [${min}, ${max}]`
  );
}

/**
 * Assert that array contains all specified items
 * @param {Array} array - Array to check
 * @param {Array} items - Items to find
 * @param {string} message - Error message
 */
export function assertContainsAll(array, items, message) {
  assert.ok(Array.isArray(array), 'Expected array');
  for (const item of items) {
    assert.ok(
      array.includes(item),
      message || `Expected array to contain: ${item}`
    );
  }
}

/**
 * Assert that array contains any of specified items
 * @param {Array} array - Array to check
 * @param {Array} items - Items to find
 * @param {string} message - Error message
 */
export function assertContainsAny(array, items, message) {
  assert.ok(Array.isArray(array), 'Expected array');
  const hasAny = items.some(item => array.includes(item));
  assert.ok(hasAny, message || `Expected array to contain at least one of: ${items.join(', ')}`);
}

/**
 * Assert that string matches regex pattern
 * @param {string} value - String to check
 * @param {RegExp} pattern - Pattern to match
 * @param {string} message - Error message
 */
export function assertMatches(value, pattern, message) {
  assert.ok(
    typeof value === 'string' && pattern.test(value),
    message || `Expected string to match pattern: ${pattern}`
  );
}

/**
 * Assert that value is a valid email address
 * @param {string} value - Value to check
 * @param {string} message - Error message
 */
export function assertEmail(value, message = 'Expected valid email address') {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  assert.ok(emailRegex.test(value), message);
}

/**
 * Assert that value is a valid URL
 * @param {string} value - Value to check
 * @param {Object} options - Options (protocols, requireProtocol)
 * @param {string} message - Error message
 */
export function assertURL(value, options = {}, message = 'Expected valid URL') {
  const { protocols = ['http:', 'https:'], requireProtocol = true } = options;
  
  try {
    const url = new URL(value);
    if (requireProtocol) {
      assert.ok(protocols.includes(url.protocol), message);
    }
  } catch {
    assert.fail(message);
  }
}

/**
 * Assert that response is successful (2xx status)
 * @param {Object} response - Response object
 * @param {string} message - Error message
 */
export function assertSuccessResponse(response, message = 'Expected successful response') {
  assert.ok(response.status >= 200 && response.status < 300, message);
  assert.ok(response.data !== undefined, 'Expected response to have data');
}

/**
 * Assert that response is an error (4xx or 5xx status)
 * @param {Object} response - Response object
 * @param {number} expectedStatus - Expected status code (optional)
 * @param {string} message - Error message
 */
export function assertErrorResponse(response, expectedStatus = null, message) {
  assert.ok(response.status >= 400, message || 'Expected error response');
  if (expectedStatus) {
    assert.equal(response.status, expectedStatus, message);
  }
}

/**
 * Assert that two dates are close to each other
 * @param {Date|string|number} actual - Actual date
 * @param {Date|string|number} expected - Expected date
 * @param {number} toleranceMs - Tolerance in milliseconds (default: 1000)
 * @param {string} message - Error message
 */
export function assertDatesClose(actual, expected, toleranceMs = 1000, message) {
  const actualTime = new Date(actual).getTime();
  const expectedTime = new Date(expected).getTime();
  const diff = Math.abs(actualTime - expectedTime);
  
  assert.ok(
    diff <= toleranceMs,
    message || `Expected dates to be within ${toleranceMs}ms, but difference was ${diff}ms`
  );
}

/**
 * Assert that function throws specific error
 * @param {Function} fn - Function to call
 * @param {string|RegExp|Function} expected - Expected error (message, pattern, or constructor)
 * @param {string} message - Error message
 */
export async function assertThrows(fn, expected, message) {
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  
  assert.ok(error !== undefined, message || 'Expected function to throw');
  
  if (typeof expected === 'string') {
    assert.ok(
      error.message.includes(expected),
      message || `Expected error message to include: ${expected}`
    );
  } else if (expected instanceof RegExp) {
    assert.ok(
      expected.test(error.message),
      message || `Expected error message to match: ${expected}`
    );
  } else if (typeof expected === 'function') {
    assert.ok(
      error instanceof expected,
      message || `Expected error to be instance of: ${expected.name}`
    );
  }
  
  return error;
}

/**
 * Assert that promise rejects with specific error
 * @param {Promise} promise - Promise to check
 * @param {string|RegExp|Function} expected - Expected error
 * @param {string} message - Error message
 */
export async function assertRejects(promise, expected, message) {
  return assertThrows(async () => await promise, expected, message);
}

/**
 * Assert that object deeply equals expected, ignoring certain keys
 * @param {Object} actual - Actual object
 * @param {Object} expected - Expected object
 * @param {string[]} ignoreKeys - Keys to ignore
 * @param {string} message - Error message
 */
export function assertDeepEqualIgnoring(actual, expected, ignoreKeys = [], message) {
  const actualCopy = { ...actual };
  const expectedCopy = { ...expected };
  
  for (const key of ignoreKeys) {
    delete actualCopy[key];
    delete expectedCopy[key];
  }
  
  assert.deepEqual(actualCopy, expectedCopy, message);
}

/**
 * Assert that array is sorted by specified key
 * @param {Array} array - Array to check
 * @param {string} key - Key to sort by
 * @param {string} order - Sort order ('asc' or 'desc')
 * @param {string} message - Error message
 */
export function assertSortedBy(array, key, order = 'asc', message) {
  assert.ok(Array.isArray(array), 'Expected array');
  
  for (let i = 1; i < array.length; i++) {
    const a = array[i - 1][key];
    const b = array[i][key];
    
    if (order === 'asc') {
      assert.ok(a <= b, message || `Expected array to be sorted by ${key} ascending`);
    } else {
      assert.ok(a >= b, message || `Expected array to be sorted by ${key} descending`);
    }
  }
}

/**
 * Assert that object is valid CV structure
 * @param {Object} cv - CV object to validate
 * @param {string} message - Error message
 */
export function assertValidCV(cv, message = 'Expected valid CV structure') {
  assert.ok(cv !== null && typeof cv === 'object', message);
  assert.ok(typeof cv.id === 'string', `${message}: missing or invalid id`);
  assert.ok(typeof cv.name === 'string', `${message}: missing or invalid name`);
  assert.ok(typeof cv.version === 'string', `${message}: missing or invalid version`);
  
  if (cv.email) {
    assertEmail(cv.email, `${message}: invalid email`);
  }
  
  if (cv.skills) {
    assert.ok(Array.isArray(cv.skills), `${message}: skills should be array`);
  }
  
  if (cv.experience) {
    assert.ok(Array.isArray(cv.experience), `${message}: experience should be array`);
  }
}

/**
 * Assert that object is valid task structure
 * @param {Object} task - Task object to validate
 * @param {string} message - Error message
 */
export function assertValidTask(task, message = 'Expected valid task structure') {
  assert.ok(task !== null && typeof task === 'object', message);
  assert.ok(typeof task.id === 'string', `${message}: missing or invalid id`);
  assert.ok(typeof task.type === 'string', `${message}: missing or invalid type`);
  assert.ok(typeof task.status === 'string', `${message}: missing or invalid status`);
  
  const validStatuses = ['pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled'];
  assert.ok(validStatuses.includes(task.status), `${message}: invalid status`);
  
  if (task.priority !== undefined) {
    assertInRange(task.priority, 1, 10, `${message}: priority should be 1-10`);
  }
}

/**
 * Assert that object is valid paginated response
 * @param {Object} response - Response to validate
 * @param {string} message - Error message
 */
export function assertPaginatedResponse(response, message = 'Expected paginated response') {
  assert.ok(response !== null && typeof response === 'object', message);
  assert.ok(Array.isArray(response.items), `${message}: missing items array`);
  assert.ok(typeof response.total === 'number', `${message}: missing total count`);
  assert.ok(response.pagination !== undefined, `${message}: missing pagination`);
  assert.ok(typeof response.pagination.page === 'number', `${message}: missing page number`);
  assert.ok(typeof response.pagination.limit === 'number', `${message}: missing limit`);
  assert.ok(typeof response.pagination.totalPages === 'number', `${message}: missing totalPages`);
}

/**
 * Assert that metrics object has expected structure
 * @param {Object} metrics - Metrics object
 * @param {string[]} expectedMetrics - Expected metric names
 * @param {string} message - Error message
 */
export function assertHasMetrics(metrics, expectedMetrics, message = 'Expected metrics') {
  assert.ok(metrics !== null && typeof metrics === 'object', message);
  
  for (const metric of expectedMetrics) {
    assert.ok(metric in metrics, `${message}: missing metric ${metric}`);
    assert.ok(typeof metrics[metric] === 'number', `${message}: metric ${metric} should be number`);
  }
}

/**
 * Assert that WebSocket message has expected structure
 * @param {Object} message - Message to validate
 * @param {string} expectedType - Expected message type
 * @param {string} messageLabel - Label for error messages
 */
export function assertWebSocketMessage(message, expectedType = null, messageLabel = 'Message') {
  assert.ok(message !== null && typeof message === 'object', `Expected ${messageLabel} to be object`);
  
  if (expectedType) {
    assert.equal(message.type, expectedType, `Expected ${messageLabel} type to be ${expectedType}`);
  }
  
  assert.ok(message.timestamp || message.data !== undefined, `Expected ${messageLabel} to have timestamp or data`);
}

/**
 * Create custom assertion with soft failure (collects all failures)
 * @returns {Object} Soft assertion collector
 */
export function createSoftAssertions() {
  const failures = [];
  
  return {
    assert(condition, message) {
      if (!condition) {
        failures.push(message || 'Assertion failed');
      }
    },
    
    equal(actual, expected, message) {
      if (actual !== expected) {
        failures.push(message || `Expected ${expected}, got ${actual}`);
      }
    },
    
    deepEqual(actual, expected, message) {
      try {
        assert.deepEqual(actual, expected);
      } catch (e) {
        failures.push(message || e.message);
      }
    },
    
    ok(value, message) {
      if (!value) {
        failures.push(message || `Expected truthy value, got ${value}`);
      }
    },
    
    verify() {
      if (failures.length > 0) {
        throw new Error(`Soft assertions failed:\n${failures.join('\n')}`);
      }
    },
    
    getFailures() {
      return [...failures];
    },
    
    hasFailures() {
      return failures.length > 0;
    }
  };
}

// Re-export standard assert methods
export const { equal, notEqual, deepEqual, notDeepEqual, ok, fail, throws, rejects, match, doesNotMatch } = assert;

export default {
  // Custom assertions
  assertUUID,
  assertISODate,
  assertHasKeys,
  assertHasAnyKey,
  assertInRange,
  assertContainsAll,
  assertContainsAny,
  assertMatches,
  assertEmail,
  assertURL,
  assertSuccessResponse,
  assertErrorResponse,
  assertDatesClose,
  assertThrows,
  assertRejects,
  assertDeepEqualIgnoring,
  assertSortedBy,
  assertValidCV,
  assertValidTask,
  assertPaginatedResponse,
  assertHasMetrics,
  assertWebSocketMessage,
  createSoftAssertions,
  // Standard assertions
  equal,
  notEqual,
  deepEqual,
  notDeepEqual,
  ok,
  fail,
  throws,
  rejects,
  match,
  doesNotMatch
};
