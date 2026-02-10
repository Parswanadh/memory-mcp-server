# Security Documentation

## Input Validation

The Memory MCP Server implements comprehensive input validation to prevent common security vulnerabilities.

### Validation Utilities (`src/validation.ts`)

The following validation functions are available:

- `sanitizeString(input, maxLength)` - Sanitizes string inputs by removing control characters and limiting length
- `sanitizeQuery(query)` - Specifically for search queries, filters GraphQL injection patterns
- `validateMemoryId(id)` - Validates UUID format
- `validateTags(tags)` - Validates and sanitizes tag arrays
- `validateImportance(importance)` - Ensures importance score is between 0-1
- `validateLimit(limit, default, max)` - Validates numeric limits with configurable maximums
- `validateTimestamp(timestamp)` - Validates timestamps are within reasonable bounds
- `validateLayer(layer)` - Validates memory layer enum values
- `validateSource(source)` - Validates memory source enum values
- `sanitizeFilter(filter)` - Sanitizes filter objects to prevent injection
- `createRateLimiter(maxRequests, windowMs)` - Creates a rate limiter for DoS protection

### Tool-Specific Validation

All MCP tool handlers validate their inputs:

1. **memory_store**
   - Content sanitized and limited to 10,000 characters
   - Importance validated to be between 0-1
   - Tags limited to 50 items, each max 50 characters
   - Layer and source validated against allowed values

2. **memory_search**
   - Query sanitized to prevent GraphQL injection
   - Query limited to 1,000 characters
   - Limit capped at 100 results
   - Special characters filtered for safety

3. **memory_recall**
   - Task and context sanitized
   - Limit validated and capped at 50

4. **memory_consolidate**
   - Timestamps validated
   - Target size validated (1-1000)
   - Layer validated

5. **memory_forget**
   - At least one deletion criteria required
   - Memory ID, timestamp, and layer validated
   - Reason sanitized and limited

6. **memory_list**
   - Layer and tags validated
   - Limit capped at 1000

## Rate Limiting

A rate limiter utility is provided but not currently enforced. To enable rate limiting:

```typescript
import { createRateLimiter } from './validation.js';

const rateLimiter = createRateLimiter(100, 60000); // 100 requests per minute

if (!rateLimiter.check(userId)) {
  throw new Error('Rate limit exceeded');
}
```

## Injection Prevention

### GraphQL Injection

Search queries are sanitized to remove GraphQL-specific characters:
- Curly braces `{ }`
- Square brackets `[ ]`
- Parentheses `( )`
- Colons `:`

### Control Characters

All string inputs have control characters removed (except newlines and tabs).

### Length Limits

All string inputs have maximum length limits enforced.

## Recommendations

1. **Enable Rate Limiting**: Implement the provided rate limiter in a production environment

2. **Audit Logging**: Add audit logging for sensitive operations like `memory_forget`

3. **Input Size Limits**: Current limits are reasonable but may need adjustment based on use cases

4. **Regular Updates**: Keep dependencies updated, especially Pinecone and Weaviate SDKs

5. **Environment Variables**: Ensure sensitive credentials (API keys) are stored securely

## Vector Store Security

### Pinecone

- API key stored in environment variable
- Namespace isolation for multi-tenancy
- Latest SDK (v5.1.0) with current security patches

### Weaviate

- API key support for authenticated connections
- HTTPS support for encrypted transport
- Latest SDK (v2.0.0) with current security patches

## Dependencies

Security-related dependencies:
- `@modelcontextprotocol/sdk` ^1.0.4
- `@pinecone-database/pinecone` ^5.1.0
- `weaviate-ts-client` ^2.0.0

Regular updates and security audits of dependencies are recommended.
