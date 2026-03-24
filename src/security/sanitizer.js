/**
 * @fileoverview Input Sanitizer for preventing various injection attacks
 * @module @cognimesh/security/sanitizer
 * @version 5.0.0
 */

/**
 * Input Sanitizer for preventing various injection attacks
 * @class Sanitizer
 */
export class Sanitizer {
  /**
   * @param {Object} [options={}] - Sanitizer options
   * @param {boolean} [options.stripTags=true] - Whether to strip HTML tags
   * @param {Array<string>} [options.allowedTags=[]] - Allowed HTML tags
   * @param {Object} [options.allowedAttributes={}] - Allowed HTML attributes
   * @param {number} [options.maxLength=10000] - Maximum string length
   */
  constructor(options = {}) {
    this.options = {
      stripTags: true,
      allowedTags: [],
      allowedAttributes: {},
      maxLength: 10000,
      ...options
    };
    
    this.xssPatterns = [
      { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, name: 'script' },
      { pattern: /javascript:/gi, name: 'javascript_protocol' },
      { pattern: /on\w+\s*=/gi, name: 'event_handler' },
      { pattern: /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, name: 'iframe' },
      { pattern: /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, name: 'object' },
      { pattern: /<embed\b[^>]*>/gi, name: 'embed' },
      { pattern: /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, name: 'form' },
      { pattern: /expression\s*\(/gi, name: 'css_expression' },
      { pattern: /url\s*\(\s*['"]*\s*javascript:/gi, name: 'css_js_url' }
    ];
    
    this.sqlPatterns = [
      { pattern: /(\%27)|(\')|(\-\-)|(\%23)|(#)/gi, name: 'quote_comment' },
      { pattern: /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi, name: 'assignment' },
      { pattern: /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi, name: 'or_operator' },
      { pattern: /((\%27)|(\'))union/gi, name: 'union' },
      { pattern: /exec(\s|\+)+(s|x)p\w+/gi, name: 'stored_proc' },
      { pattern: /UNION\s+SELECT/gi, name: 'union_select' },
      { pattern: /INSERT\s+INTO/gi, name: 'insert' },
      { pattern: /DELETE\s+FROM/gi, name: 'delete' },
      { pattern: /DROP\s+TABLE/gi, name: 'drop_table' }
    ];
    
    this.nosqlPatterns = [
      { pattern: /\$where/gi, name: 'where_operator' },
      { pattern: /\$regex/gi, name: 'regex_operator' },
      { pattern: /\$ne/gi, name: 'not_equal' },
      { pattern: /\$gt/gi, name: 'greater_than' },
      { pattern: /\$lt/gi, name: 'less_than' },
      { pattern: /\$gte/gi, name: 'gte' },
      { pattern: /\$lte/gi, name: 'lte' },
      { pattern: /\$exists/gi, name: 'exists' },
      { pattern: /\$in\s*\[/gi, name: 'in_operator' }
    ];
    
    this.commandPatterns = [
      { pattern: /[;&|`]\s*\w+/g, name: 'command_chain' },
      { pattern: /\$\(.*\)/g, name: 'command_substitution' },
      { pattern: /`.*`/g, name: 'backtick' },
      { pattern: /\|\s*\w+/g, name: 'pipe' },
      { pattern: />.*</g, name: 'redirection' },
      { pattern: /\.\.\//g, name: 'path_traversal' },
      { pattern: /\/etc\/passwd/g, name: 'passwd_file' },
      { pattern: /\/bin\/sh/g, name: 'shell' },
      { pattern: /\/bin\/bash/g, name: 'bash' },
      { pattern: /cmd\.exe/gi, name: 'cmd_exe' },
      { pattern: /powershell/gi, name: 'powershell' }
    ];
  }

  /**
   * Sanitize input against XSS attacks
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  xss(input) {
    if (typeof input !== 'string') return '';
    
    let sanitized = input;
    
    this.xssPatterns.forEach(({ pattern }) => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
    
    return this.truncate(sanitized);
  }

  /**
   * Sanitize input against SQL injection
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  sql(input) {
    if (typeof input !== 'string') return '';
    
    let sanitized = input;
    
    this.sqlPatterns.forEach(({ pattern }) => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    sanitized = sanitized
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replaceAll('\u0000', '\\0')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replaceAll('\u001a', '\\Z');
    
    return this.truncate(sanitized);
  }

  /**
   * Sanitize input against NoSQL injection
   * @param {string|Object} input - Input to sanitize
   * @returns {string|Object} Sanitized input
   */
  nosql(input) {
    if (typeof input === 'string') {
      let sanitized = input;
      
      this.nosqlPatterns.forEach(({ pattern }) => {
        sanitized = sanitized.replace(pattern, '');
      });
      
      sanitized = sanitized.replace(/\$\w+/g, '');
      
      return this.truncate(sanitized);
    }
    
    if (typeof input === 'object' && input !== null) {
      return this.sanitizeObject(input, (key, value) => {
        if (typeof key === 'string' && key.startsWith('$')) {
          return undefined;
        }
        return this.nosql(value);
      });
    }
    
    return input;
  }

  /**
   * Sanitize HTML input
   * @param {string} input - HTML input to sanitize
   * @returns {string} Sanitized HTML
   */
  html(input) {
    if (typeof input !== 'string') return '';
    
    let sanitized = input;
    
    if (this.options.stripTags) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    } else {
      const allowedTags = this.options.allowedTags.map(t => t.toLowerCase());
      const tagPattern = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
      
      sanitized = sanitized.replace(tagPattern, (match, tag) => {
        return allowedTags.includes(tag.toLowerCase()) ? match : '';
      });
    }
    
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
    
    return this.truncate(sanitized);
  }

  /**
   * Sanitize input against command injection
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  command(input) {
    if (typeof input !== 'string') return '';
    
    let sanitized = input;
    
    this.commandPatterns.forEach(({ pattern }) => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    sanitized = sanitized.replace(/[;&|`$(){}[\]\\*?<>]/g, '');
    sanitized = sanitized.split('').filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    }).join('');
    
    return this.truncate(sanitized);
  }

  /**
   * Sanitize email address
   * @param {string} input - Email to sanitize
   * @returns {string} Sanitized email
   */
  email(input) {
    if (typeof input !== 'string') return '';
    
    let sanitized = input.replace(/[^a-zA-Z0-9.@_+-]/g, '');
    sanitized = sanitized.toLowerCase().trim();
    
    return this.truncate(sanitized, 254);
  }

  /**
   * Sanitize URL
   * @param {string} input - URL to sanitize
   * @returns {string} Sanitized URL
   */
  url(input) {
    if (typeof input !== 'string') return '';
    
    let sanitized = input.trim();
    sanitized = sanitized.replace(/^(javascript|data|vbscript|file):/gi, '');
    
    try {
      const url = new URL(sanitized);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return '';
      }
      return url.toString();
    } catch {
      return '';
    }
  }

  /**
   * Deep sanitize an object
   * @param {Object} obj - Object to sanitize
   * @param {Function} transform - Transform function
   * @returns {Object} Sanitized object
   * @private
   */
  sanitizeObject(obj, transform) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, transform));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        const transformedValue = transform(key, value);
        if (transformedValue !== undefined) {
          result[key] = transformedValue;
        }
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Truncate string to max length
   * @param {string} input - Input string
   * @param {number} [maxLength=this.options.maxLength] - Maximum length
   * @returns {string} Truncated string
   * @private
   */
  truncate(input, maxLength = this.options.maxLength) {
    if (typeof input !== 'string') return input;
    if (input.length > maxLength) {
      return input.substring(0, maxLength);
    }
    return input;
  }

  /**
   * Sanitize all string values in an object
   * @param {Object} data - Data to sanitize
   * @param {Array<string>} [fields=[]] - Fields to sanitize
   * @returns {Object} Sanitized data
   */
  sanitizeFields(data, fields = []) {
    const result = { ...data };
    
    fields.forEach(field => {
      if (field in result) {
        result[field] = this.xss(String(result[field]));
      }
    });
    
    return result;
  }

  /**
   * Comprehensive sanitization for user input
   * @param {string} input - User input
   * @returns {Object} Sanitized results by type
   */
  comprehensive(input) {
    return {
      xss: this.xss(input),
      sql: this.sql(input),
      nosql: this.nosql(input),
      html: this.html(input),
      command: this.command(input)
    };
  }
}

export default Sanitizer;
