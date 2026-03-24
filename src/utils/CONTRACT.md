# Utils Module Contract

## Overview

The Utils Module provides common utility functions for CogniMesh v5.0. It includes ID generation, object manipulation, function utilities, async helpers, JSON utilities, string operations, array operations, and date formatting.

## Public Interfaces

### ID Generation

- `generateId(prefix)` - Generates unique ID
  - `prefix` (string) - Optional prefix
  - Returns: string

### Object Utilities

- `deepClone(obj)` - Deep clones an object
  - `obj` (any) - Object to clone
  - Returns: any

- `pick(obj, keys)` - Picks specific keys
  - `obj` (object) - Source object
  - `keys` (string[]) - Keys to pick
  - Returns: object

- `omit(obj, keys)` - Omits specific keys
  - `obj` (object) - Source object
  - `keys` (string[]) - Keys to omit
  - Returns: object

- `mergeDeep(target, source)` - Deep merges objects
  - `target` (object) - Target object
  - `source` (object) - Source object
  - Returns: object

### Function Utilities

- `debounce(fn, delay)` - Debounces function
  - `fn` (Function) - Function to debounce
  - `delay` (number) - Delay in milliseconds
  - Returns: Function with cancel method

- `throttle(fn, delay)` - Throttles function
  - `fn` (Function) - Function to throttle
  - `delay` (number) - Delay in milliseconds
  - Returns: Function with cancel method

- `memoize(fn, keyFn)` - Memoizes function
  - `fn` (Function) - Function to memoize
  - `keyFn` (Function) - Key generator
  - Returns: Function with cache and clear methods

### Async Utilities

- `retry(fn, options)` - Retries function with backoff
  - `fn` (Function) - Function to retry
  - `options.maxAttempts` - Max retry attempts
  - `options.delay` - Initial delay
  - `options.backoff` - Backoff multiplier
  - `options.shouldRetry` - Retry condition
  - Returns: Promise<any>

- `timeout(fn, ms, message)` - Wraps with timeout
  - `fn` (Function) - Function to wrap
  - `ms` (number) - Timeout in milliseconds
  - `message` (string) - Error message
  - Returns: Promise<any>

- `sleep(ms)` - Sleeps for duration
  - `ms` (number) - Milliseconds
  - Returns: Promise<void>

### JSON Utilities

- `parseJSON(str, fallback)` - Safely parses JSON
  - `str` (string) - String to parse
  - `fallback` (any) - Fallback value
  - Returns: any

- `safeJsonParse(str, fallback)` - Alias for parseJSON
  - Returns: any

- `safeJsonStringify(obj, indent)` - Safely stringifies
  - `obj` (any) - Object to stringify
  - `indent` (number) - Indentation
  - Returns: string

### String Utilities

- `sanitizeString(str, options)` - Sanitizes string
  - `options.removeHtml` - Remove HTML
  - `options.escape` - Escape special chars
  - `options.maxLength` - Max length
  - Returns: string

- `truncate(str, maxLength, suffix)` - Truncates string
  - `str` (string) - String to truncate
  - `maxLength` (number) - Maximum length
  - `suffix` (string) - Truncation suffix
  - Returns: string

- `capitalize(str)` - Capitalizes first letter
  - Returns: string

- `camelCase(str)` - Converts to camelCase
  - Returns: string

- `kebabCase(str)` - Converts to kebab-case
  - Returns: string

- `snakeCase(str)` - Converts to snake_case
  - Returns: string

### Array Utilities

- `groupBy(arr, key)` - Groups array items
  - `arr` (Array) - Array to group
  - `key` (string|Function) - Group key
  - Returns: object

- `chunk(arr, size)` - Chunks array
  - `arr` (Array) - Array to chunk
  - `size` (number) - Chunk size
  - Returns: Array[]

- `flatten(arr, depth)` - Flattens array
  - `arr` (Array) - Array to flatten
  - `depth` (number) - Flatten depth
  - Returns: Array

- `flattenDeep(arr)` - Deep flattens array
  - Returns: Array

- `uniq(arr)` - Gets unique values
  - Returns: Array

- `uniqBy(arr, key)` - Gets unique by key
  - Returns: Array

### Date Utilities

- `formatDate(date, format)` - Formats date
  - `date` (Date|string|number) - Date to format
  - `format` (string) - Format string
  - Returns: string

### Validation Utilities

- `isEmpty(value)` - Checks if value is empty
  - Returns: boolean

- `isEmail(email)` - Checks if valid email
  - Returns: boolean

- `isUrl(url)` - Checks if valid URL
  - Returns: boolean

## Data Structures

### RetryOptions

```typescript
interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
  shouldRetry?: (error: Error) => boolean;
}
```

### SanitizeOptions

```typescript
interface SanitizeOptions {
  removeHtml?: boolean;
  escape?: boolean;
  maxLength?: number;
}
```

### MemoizedFunction

```typescript
interface MemoizedFunction<T> extends Function {
  cache: Map<string, T>;
  clear: () => void;
}
```

## Usage Example

```javascript
import { 
  generateId, 
  deepClone, 
  debounce, 
  retry,
  formatDate 
} from './utils/index.js';

// Generate ID
const id = generateId('task');  // "task_a1b2c3_d4e5f6"

// Deep clone
const copy = deepClone(original);

// Debounce
const saveDebounced = debounce(saveData, 500);
saveDebounced();  // Will execute after 500ms
saveDebounced.cancel();  // Cancel pending

// Retry
const result = await retry(fetchData, {
  maxAttempts: 3,
  delay: 1000,
  backoff: 2
});

// Format date
const formatted = formatDate(new Date(), 'YYYY-MM-DD');
```
