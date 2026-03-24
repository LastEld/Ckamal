# Utils Module

## Overview

The Utils Module provides common utility functions used throughout CogniMesh v5.0. It offers a comprehensive set of helpers for ID generation, object manipulation, function utilities, async operations, JSON handling, string processing, array operations, date formatting, and validation.

## Architecture

### Utility Categories

```
utils/
├── ID Generation      # Unique ID creation
├── Object Utilities   # Clone, pick, omit, merge
├── Function Utils     # Debounce, throttle, memoize
├── Async Utilities    # Retry, timeout, sleep
├── JSON Utilities     # Safe parse/stringify
├── String Utilities   # Sanitize, truncate, case
├── Array Utilities    # Group, chunk, flatten, unique
├── Date Utilities     # Date formatting
└── Validation         # Type checking
```

## Components

### ID Generation

Unique identifier generation:

- **Timestamp-based**: Includes timestamp for sortability
- **Random component**: Adds randomness for uniqueness
- **Prefix support**: Optional prefix for type indication

### Object Utilities

Object manipulation:

- **Deep Clone**: Recursive cloning including special types
- **Pick/Omit**: Selective property extraction
- **Deep Merge**: Recursive object merging
- **Type Support**: Handles Dates, Maps, Sets, RegExp

### Function Utilities

Function wrappers:

- **Debounce**: Delay execution until pause
- **Throttle**: Limit execution rate
- **Memoize**: Cache function results

### Async Utilities

Asynchronous helpers:

- **Retry**: Exponential backoff retry
- **Timeout**: Function timeout wrapper
- **Sleep**: Promise-based delay

### JSON Utilities

JSON handling:

- **Safe Parse**: Graceful JSON parsing
- **Safe Stringify**: Circular reference handling
- **Fallback Support**: Default values on error

### String Utilities

String processing:

- **Sanitization**: HTML removal/escaping
- **Truncation**: Length-limited strings
- **Case Conversion**: camelCase, kebab-case, snake_case

### Array Utilities

Array operations:

- **Grouping**: Group by key or function
- **Chunking**: Split into smaller arrays
- **Flattening**: Nested array flattening
- **Deduplication**: Unique value extraction

### Date Utilities

Date formatting:

- **Multiple Formats**: ISO, short, long, custom
- **Flexible Input**: Accepts Date, string, number
- **Template Support**: YYYY, MM, DD, etc.

### Validation

Type validation:

- **Empty Check**: null, undefined, empty checks
- **Email Validation**: Format validation
- **URL Validation**: Protocol validation

## Usage

### ID Generation

```javascript
import { generateId } from './utils/index.js';

// Generate unique ID
const id1 = generateId();
// "a1b2c3_d4e5f6g7"

// With prefix
const taskId = generateId('task');
// "task_a1b2c3_d4e5f6"

const userId = generateId('user');
// "user_x9y8z7_w6v5u4"
```

### Object Manipulation

```javascript
import { deepClone, pick, omit, mergeDeep } from './utils/index.js';

const obj = {
  name: 'John',
  age: 30,
  address: { city: 'NYC', zip: '10001' },
  tags: ['a', 'b']
};

// Deep clone
const clone = deepClone(obj);
clone.address.city = 'LA';  // Doesn't affect original

// Pick specific keys
const basic = pick(obj, ['name', 'age']);
// { name: 'John', age: 30 }

// Omit keys
const noAddress = omit(obj, ['address']);
// { name: 'John', age: 30, tags: ['a', 'b'] }

// Deep merge
const merged = mergeDeep(
  { a: 1, b: { c: 2 } },
  { b: { d: 3 }, e: 4 }
);
// { a: 1, b: { c: 2, d: 3 }, e: 4 }
```

### Function Control

```javascript
import { debounce, throttle, memoize } from './utils/index.js';

// Debounce
const search = debounce((query) => {
  performSearch(query);
}, 300);

input.addEventListener('input', (e) => {
  search(e.target.value);  // Executes 300ms after last input
});

// Cancel pending debounce
search.cancel();

// Throttle
const scrollHandler = throttle(() => {
  updateScrollPosition();
}, 100);

window.addEventListener('scroll', scrollHandler);

// Memoize
const fibonacci = memoize((n) => {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
});

console.log(fibonacci(40));  // Fast due to memoization
fibonacci.clear();  // Clear cache
```

### Async Helpers

```javascript
import { retry, timeout, sleep } from './utils/index.js';

// Retry with backoff
const data = await retry(
  () => fetchFromUnreliableAPI(),
  {
    maxAttempts: 5,
    delay: 1000,
    backoff: 2,
    shouldRetry: (error) => error.code === 'ETIMEDOUT'
  }
);

// Timeout wrapper
const result = await timeout(
  () => potentiallySlowOperation(),
  5000,
  'Operation timed out after 5 seconds'
);

// Sleep
await sleep(1000);  // Wait 1 second
console.log('1 second later');
```

### JSON Handling

```javascript
import { parseJSON, safeJsonStringify } from './utils/index.js';

// Safe parse
const obj = parseJSON('{"a": 1}', {});
const fallback = parseJSON('invalid json', { default: true });

// Safe stringify with circular reference
const circular = { a: 1 };
circular.self = circular;

const str = safeJsonStringify(circular, 2);
// {"a": 1, "self": "[Circular]"}
```

### String Processing

```javascript
import { 
  sanitizeString, 
  truncate, 
  camelCase, 
  kebabCase, 
  snakeCase 
} from './utils/index.js';

// Sanitize
const clean = sanitizeString('<script>alert("xss")</script>', {
  removeHtml: true
});
// "alert(&quot;xss&quot;)"

// Truncate
const short = truncate('This is a very long string', 10);
// "This is..."

// Case conversions
console.log(camelCase('hello world'));   // "helloWorld"
console.log(kebabCase('helloWorld'));    // "hello-world"
console.log(snakeCase('helloWorld'));    // "hello_world"
console.log(capitalize('hello'));        // "Hello"
```

### Array Operations

```javascript
import { groupBy, chunk, flatten, uniq, uniqBy } from './utils/index.js';

const users = [
  { name: 'John', role: 'admin' },
  { name: 'Jane', role: 'user' },
  { name: 'Bob', role: 'admin' }
];

// Group by
const byRole = groupBy(users, 'role');
// { admin: [John, Bob], user: [Jane] }

// Chunk
const chunks = chunk([1, 2, 3, 4, 5], 2);
// [[1, 2], [3, 4], [5]]

// Flatten
const flat = flatten([[1, 2], [3, 4]], 1);
// [1, 2, 3, 4]

// Unique
const unique = uniq([1, 2, 2, 3, 3, 3]);
// [1, 2, 3]

// Unique by key
const uniqueUsers = uniqBy(users, 'role');
// [John, Jane] (first of each role)
```

### Date Formatting

```javascript
import { formatDate } from './utils/index.js';

const date = new Date('2024-03-15T14:30:00');

formatDate(date, 'ISO');
// "2024-03-15T14:30:00.000Z"

formatDate(date, 'short');
// "3/15/2024"

formatDate(date, 'long');
// "Friday, March 15, 2024"

formatDate(date, 'YYYY-MM-DD');
// "2024-03-15"

formatDate(date, 'HH:mm:ss');
// "14:30:00"
```

### Validation

```javascript
import { isEmpty, isEmail, isUrl } from './utils/index.js';

isEmpty(null);        // true
isEmpty('');          // true
isEmpty([]);          // true
isEmpty({});          // true
isEmpty('hello');     // false

isEmail('user@example.com');     // true
isEmail('invalid');              // false

isUrl('https://example.com');    // true
isUrl('not-a-url');              // false
```

## Configuration

### Retry Defaults

```javascript
{
  maxAttempts: 3,
  delay: 1000,
  backoff: 2,
  shouldRetry: () => true
}
```

### Date Format Patterns

```javascript
{
  ISO: 'ISO',
  short: 'short',
  long: 'long',
  time: 'time',
  datetime: 'datetime',
  date: 'date',
  timestamp: 'timestamp',
  custom: 'YYYY-MM-DD HH:mm:ss'
}
```

## Best Practices

1. **Use Utilities**: Prefer module utilities over custom implementations
2. **Handle Errors**: Use safeJSON variants for untrusted data
3. **Debounce Input**: Debounce user input handlers
4. **Memoize Pure Functions**: Cache expensive computations
5. **Retry Transient Errors**: Use retry for network operations
6. **Validate Input**: Check types before operations
7. **Sanitize Output**: Clean data before display
8. **Test Utilities**: Verify utility behavior with edge cases
