import assert from 'node:assert/strict';

function createThrownMatcher(expected) {
  if (expected instanceof RegExp || typeof expected === 'function') {
    return expected;
  }

  if (typeof expected === 'string') {
    return new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }

  return undefined;
}

export function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toContain(expected) {
      if (typeof actual === 'string') {
        assert.ok(actual.includes(expected));
        return;
      }

      assert.ok(Array.isArray(actual) && actual.includes(expected));
    },
    toMatch(expected) {
      const matcher = expected instanceof RegExp
        ? expected
        : new RegExp(String(expected).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      assert.match(String(actual), matcher);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toBeGreaterThan(expected) {
      assert.ok(actual > expected);
    },
    toBeGreaterThanOrEqual(expected) {
      assert.ok(actual >= expected);
    },
    toBeLessThan(expected) {
      assert.ok(actual < expected);
    },
    toBeLessThanOrEqual(expected) {
      assert.ok(actual <= expected);
    },
    toHaveProperty(expected) {
      assert.ok(actual !== null && actual !== undefined);
      assert.ok(expected in actual);
    },
    toBeInstanceOf(expected) {
      assert.ok(actual instanceof expected);
    },
    get not() {
      return {
        toBe(expected) {
          assert.notStrictEqual(actual, expected);
        },
        toContain(expected) {
          if (typeof actual === 'string') {
            assert.ok(!actual.includes(expected));
            return;
          }

          assert.ok(Array.isArray(actual) && !actual.includes(expected));
        }
      };
    },
    get rejects() {
      return {
        async toThrow(expected) {
          await assert.rejects(actual, createThrownMatcher(expected));
        }
      };
    }
  };
}

export default expect;
