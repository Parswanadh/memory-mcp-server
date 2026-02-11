/**
 * Security utilities for sanitizing sensitive data
 */

/**
 * Patterns that might expose sensitive data in error messages
 */
const SENSITIVE_PATTERNS = [
  // API keys (common formats)
  /Bearer\s+([a-zA-Z0-9_-]{20,})/gi,
  /sk-[a-zA-Z0-9]{20,}/gi,
  /api[_-]?key["\s:=]+([a-zA-Z0-9_-]{10,})/gi,
  /authorization["\s:=]+([a-zA-Z0-9_-]{10,})/gi,
  /token["\s:=]+([a-zA-Z0-9_-]{20,})/gi,
  // Connection strings that might contain credentials
  /mongodb:\/\/[^:@]+:[^@]+@/gi,
  /postgres:\/\/[^:@]+:[^@]+@/gi,
  /mysql:\/\/[^:@]+:[^@]+@/gi,
  // Environment variable references with values
  /[A-Z_]+=(?:["'])?([a-zA-Z0-9_-]{15,})(?:["'])?/gi,
];

/**
 * Sanitize an error message to remove sensitive data
 * @param message - The error message to sanitize
 * @returns Sanitized error message
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Apply all sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, ...groups) => {
      // Replace the sensitive value with asterisks
      return match.replace(groups[0], '***');
    });
  }

  return sanitized;
}

/**
 * Sanitize an error object to remove sensitive data from message and stack
 * @param error - The error to sanitize
 * @returns Sanitized error message
 */
export function sanitizeError(error: unknown): string {
  let message = '';

  if (error instanceof Error) {
    message = error.message;
    // Also check stack trace if available
    if (error.stack) {
      message += ' ' + error.stack;
    }
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = String(error);
  }

  return sanitizeErrorMessage(message);
}

/**
 * Create a safe error message for logging
 * @param context - The context of the error (e.g., "OpenAI API call failed")
 * @param error - The error to sanitize
 * @returns Safe error message for logging
 */
export function createSafeErrorMessage(context: string, error: unknown): string {
  const sanitized = sanitizeError(error);
  return `${context}: ${sanitized}`;
}

/**
 * Sanitize an object by removing sensitive values
 * @param obj - The object to sanitize
 * @returns Sanitized object
 */
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if key suggests sensitive data
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('apikey') ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('credential')
    ) {
      // Mask the value
      sanitized[key] = '***';
    } else if (typeof value === 'string') {
      // Sanitize string values
      sanitized[key] = sanitizeErrorMessage(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
