/**
 * Input validation utilities for MCP tools
 */

/**
 * Sanitize a string input to prevent injection attacks
 */
export function sanitizeString(input: string, maxLength: number = 10000): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  // Remove null bytes and control characters (except newlines and tabs)
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Validate and sanitize a query string for vector search
 */
export function sanitizeQuery(query: string): string {
  const sanitized = sanitizeString(query, 1000);

  if (sanitized.length === 0) {
    throw new Error('Query cannot be empty');
  }

  // Remove potential GraphQL injection patterns
  const graphqlPatterns = [/\{.*\}/, /\[/, /\]/, /\(/, /\)/, /:/];
  for (const pattern of graphqlPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error('Query contains invalid characters');
    }
  }

  return sanitized;
}

/**
 * Validate a memory ID
 */
export function validateMemoryId(id: string): boolean {
  // Check if it's a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Validate tags array
 */
export function validateTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    throw new Error('Tags must be an array');
  }

  if (tags.length > 50) {
    throw new Error('Too many tags (max 50)');
  }

  const sanitized: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      throw new Error('Each tag must be a string');
    }

    const sanitizedTag = sanitizeString(tag, 50);
    if (sanitizedTag.length > 0) {
      sanitized.push(sanitizedTag);
    }
  }

  return sanitized;
}

/**
 * Validate importance score
 */
export function validateImportance(importance: unknown): number {
  if (typeof importance !== 'number') {
    throw new Error('Importance must be a number');
  }

  if (importance < 0 || importance > 1) {
    throw new Error('Importance must be between 0 and 1');
  }

  return importance;
}

/**
 * Validate limit parameter
 */
export function validateLimit(limit: unknown, defaultLimit: number = 10, maxLimit: number = 1000): number {
  if (limit === undefined || limit === null) {
    return defaultLimit;
  }

  if (typeof limit !== 'number') {
    throw new Error('Limit must be a number');
  }

  if (limit < 1) {
    throw new Error('Limit must be at least 1');
  }

  if (limit > maxLimit) {
    throw new Error(`Limit cannot exceed ${maxLimit}`);
  }

  return Math.floor(limit);
}

/**
 * Validate timestamp
 */
export function validateTimestamp(timestamp: unknown): number {
  if (typeof timestamp !== 'number') {
    throw new Error('Timestamp must be a number');
  }

  if (timestamp < 0) {
    throw new Error('Timestamp cannot be negative');
  }

  // Reasonable upper bound (year 2100)
  const maxTimestamp = 4102444800000;
  if (timestamp > maxTimestamp) {
    throw new Error('Timestamp is too far in the future');
  }

  return timestamp;
}

/**
 * Validate memory layer
 */
export function validateLayer(layer: unknown): string {
  if (typeof layer !== 'string') {
    throw new Error('Layer must be a string');
  }

  const validLayers = ['working', 'short-term', 'long-term'];
  if (!validLayers.includes(layer)) {
    throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
  }

  return layer;
}

/**
 * Validate memory source
 */
export function validateSource(source: unknown): string {
  if (typeof source !== 'string') {
    throw new Error('Source must be a string');
  }

  const validSources = ['user', 'agent', 'system'];
  if (!validSources.includes(source)) {
    throw new Error(`Invalid source. Must be one of: ${validSources.join(', ')}`);
  }

  return source;
}

/**
 * Sanitize filter object to prevent injection
 */
export function sanitizeFilter(filter: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filter)) {
    // Whitelist allowed filter keys
    const allowedKeys = ['layer', 'tags', 'minImportance', 'olderThan'];
    if (!allowedKeys.includes(key)) {
      throw new Error(`Invalid filter key: ${key}`);
    }

    if (key === 'layer' && typeof value === 'string') {
      sanitized[key] = validateLayer(value);
    } else if (key === 'tags' && Array.isArray(value)) {
      sanitized[key] = validateTags(value);
    } else if (key === 'minImportance' && typeof value === 'number') {
      if (value < 0 || value > 1) {
        throw new Error('minImportance must be between 0 and 1');
      }
      sanitized[key] = value;
    } else if (key === 'olderThan' && typeof value === 'number') {
      sanitized[key] = validateTimestamp(value);
    }
  }

  return sanitized;
}

/**
 * Create a rate limit checker
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests: Map<string, number[]> = new Map();

  return {
    check(identifier: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      let userRequests = requests.get(identifier) || [];
      // Remove requests outside the window
      userRequests = userRequests.filter(t => t > windowStart);

      if (userRequests.length >= maxRequests) {
        return false;
      }

      userRequests.push(now);
      requests.set(identifier, userRequests);
      return true;
    },

    reset(identifier?: string): void {
      if (identifier) {
        requests.delete(identifier);
      } else {
        requests.clear();
      }
    }
  };
}
