/**
 * Query Validator Module
 *
 * Validates SQL queries to ensure only read-only operations are allowed.
 * Prevents SQL injection and data modification attempts.
 *
 * @module query-validator
 */

import { ValidationResult } from './types.js';

/**
 * SQL statement keywords that are never allowed as the top-level statement.
 *
 * REPLACE is intentionally handled as a statement keyword only so the
 * read-only string function REPLACE(...) can still be used in SELECT queries.
 */
export const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'REPLACE',
  'GRANT',
  'REVOKE',
  'LOCK',
  'UNLOCK',
  'CALL',
  'SET',
  'USE',
  'LOAD'
] as const;

/**
 * List of allowed SQL statement types (read-only operations)
 */
export const ALLOWED_STATEMENTS = ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN'] as const;

type AllowedStatement = typeof ALLOWED_STATEMENTS[number];

type TokenKind = 'word' | 'open-paren' | 'close-paren' | 'comma' | 'semicolon';

interface SqlToken {
  kind: TokenKind;
  value: string;
  depth: number;
}

interface ClassificationResult {
  allowed: boolean;
  queryType?: AllowedStatement;
  error?: string;
}

const TOP_LEVEL_FORBIDDEN_STATEMENTS = new Set<string>(FORBIDDEN_KEYWORDS);

/**
 * Scans SQL into significant tokens while ignoring comments, string literals,
 * and quoted identifiers. This is intentionally small and conservative rather
 * than a full SQL parser.
 */
function scanTokens(query: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let depth = 0;
  let index = 0;

  while (index < query.length) {
    const char = query[index];
    const nextChar = query[index + 1];

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }

    if (char === '-' && nextChar === '-') {
      index = skipLineComment(query, index + 2);
      continue;
    }

    if (char === '#') {
      index = skipLineComment(query, index + 1);
      continue;
    }

    if (char === '/' && nextChar === '*') {
      index = skipBlockComment(query, index + 2);
      continue;
    }

    if (char === "'" || char === '"') {
      index = skipQuotedContent(query, index, char);
      continue;
    }

    if (char === '`') {
      index = skipQuotedIdentifier(query, index);
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'open-paren', value: char, depth });
      depth += 1;
      index += 1;
      continue;
    }

    if (char === ')') {
      depth = Math.max(depth - 1, 0);
      tokens.push({ kind: 'close-paren', value: char, depth });
      index += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ kind: 'comma', value: char, depth });
      index += 1;
      continue;
    }

    if (char === ';') {
      tokens.push({ kind: 'semicolon', value: char, depth });
      index += 1;
      continue;
    }

    if (isWordStart(char)) {
      const start = index;
      index += 1;

      while (index < query.length && isWordPart(query[index])) {
        index += 1;
      }

      tokens.push({
        kind: 'word',
        value: query.slice(start, index).toUpperCase(),
        depth
      });
      continue;
    }

    index += 1;
  }

  return tokens;
}

function skipLineComment(query: string, index: number): number {
  while (index < query.length && query[index] !== '\n' && query[index] !== '\r') {
    index += 1;
  }

  return index;
}

function skipBlockComment(query: string, index: number): number {
  while (index < query.length - 1) {
    if (query[index] === '*' && query[index + 1] === '/') {
      return index + 2;
    }

    index += 1;
  }

  return query.length;
}

function skipQuotedContent(query: string, index: number, quote: string): number {
  index += 1;

  while (index < query.length) {
    const char = query[index];
    const nextChar = query[index + 1];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === quote && nextChar === quote) {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return query.length;
}

function skipQuotedIdentifier(query: string, index: number): number {
  index += 1;

  while (index < query.length) {
    if (query[index] === '`' && query[index + 1] === '`') {
      index += 2;
      continue;
    }

    if (query[index] === '`') {
      return index + 1;
    }

    index += 1;
  }

  return query.length;
}

function isWordStart(char: string): boolean {
  return /[A-Za-z_]/u.test(char);
}

function isWordPart(char: string): boolean {
  return /[A-Za-z0-9_$]/u.test(char);
}

function hasMultipleTopLevelStatements(tokens: SqlToken[]): boolean {
  return tokens.some((token, index) => {
    if (token.kind !== 'semicolon' || token.depth !== 0) {
      return false;
    }

    return tokens.slice(index + 1).some(nextToken => nextToken.kind !== 'semicolon');
  });
}

function hasTokenSequence(tokens: SqlToken[], sequence: string[]): boolean {
  const words = tokens.filter(token => token.kind === 'word').map(token => token.value);

  return words.some((word, index) => {
    if (word !== sequence[0]) {
      return false;
    }

    return sequence.every((expected, sequenceIndex) => words[index + sequenceIndex] === expected);
  });
}

function hasForbiddenClause(tokens: SqlToken[]): string | null {
  if (hasTokenSequence(tokens, ['FOR', 'UPDATE'])) {
    return 'FOR UPDATE';
  }

  if (hasTokenSequence(tokens, ['INTO', 'OUTFILE'])) {
    return 'INTO OUTFILE';
  }

  if (hasTokenSequence(tokens, ['INTO', 'DUMPFILE'])) {
    return 'INTO DUMPFILE';
  }

  if (hasTokenSequence(tokens, ['LOCK', 'IN', 'SHARE', 'MODE'])) {
    return 'LOCK IN SHARE MODE';
  }

  if (hasTokenSequence(tokens, ['REPLACE', 'INTO'])) {
    return 'REPLACE INTO';
  }

  return null;
}

function classifyQuery(tokens: SqlToken[]): ClassificationResult {
  const firstToken = tokens.find(token => token.kind === 'word');

  if (!firstToken) {
    return {
      allowed: false,
      error: 'Query cannot be empty or contain only whitespace/comments'
    };
  }

  const firstKeyword = firstToken.value;

  if (firstKeyword === 'WITH') {
    return classifyCteQuery(tokens);
  }

  if (TOP_LEVEL_FORBIDDEN_STATEMENTS.has(firstKeyword)) {
    return {
      allowed: false,
      error: `Query rejected: Top-level statement '${firstKeyword}' is not allowed. Data modification is not allowed.`
    };
  }

  if (!ALLOWED_STATEMENTS.includes(firstKeyword as AllowedStatement)) {
    return {
      allowed: false,
      error: `Query rejected: Only SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH ... SELECT statements are allowed. Found: ${firstKeyword || 'unknown'}`
    };
  }

  return {
    allowed: true,
    queryType: firstKeyword as AllowedStatement
  };
}

function classifyCteQuery(tokens: SqlToken[]): ClassificationResult {
  const mainStatement = getCteMainStatement(tokens);

  if (!mainStatement) {
    return {
      allowed: false,
      error: 'Query rejected: WITH queries must contain a SELECT main statement.'
    };
  }

  if (mainStatement !== 'SELECT') {
    return {
      allowed: false,
      error: `Query rejected: WITH queries must end in a SELECT statement. Found: ${mainStatement}`
    };
  }

  return {
    allowed: true,
    queryType: 'SELECT'
  };
}

function getCteMainStatement(tokens: SqlToken[]): string | null {
  let index = 1;

  if (tokens[index]?.kind === 'word' && tokens[index].value === 'RECURSIVE') {
    index += 1;
  }

  while (index < tokens.length) {
    if (tokens[index]?.kind !== 'word') {
      return null;
    }

    index += 1;

    if (tokens[index]?.kind === 'open-paren' && tokens[index].depth === 0) {
      index = skipParenthesizedTokens(tokens, index);
    }

    if (tokens[index]?.kind !== 'word' || tokens[index].value !== 'AS' || tokens[index].depth !== 0) {
      return null;
    }

    index += 1;

    if (tokens[index]?.kind !== 'open-paren' || tokens[index].depth !== 0) {
      return null;
    }

    index = skipParenthesizedTokens(tokens, index);

    if (tokens[index]?.kind === 'comma' && tokens[index].depth === 0) {
      index += 1;
      continue;
    }

    return tokens.slice(index).find(token => token.kind === 'word' && token.depth === 0)?.value ?? null;
  }

  return null;
}

function skipParenthesizedTokens(tokens: SqlToken[], startIndex: number): number {
  const startDepth = tokens[startIndex].depth;
  let index = startIndex + 1;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.kind === 'close-paren' && token.depth === startDepth) {
      return index + 1;
    }

    index += 1;
  }

  return tokens.length;
}

/**
 * Checks if a query is read-only.
 *
 * @param query - The SQL query to validate
 * @returns true if the query is read-only, false otherwise
 *
 * **Validates: Requirements 1.4, 5.1, 8.1**
 */
export function isReadOnly(query: string): boolean {
  return validate(query).valid;
}

/**
 * Validates a query and returns detailed validation result
 *
 * @param query - The SQL query to validate
 * @returns ValidationResult with valid status, error message, and query type
 *
 * **Validates: Requirements 1.4, 5.1, 5.2, 8.1, 8.2**
 */
export function validate(query: string): ValidationResult {
  if (!query || typeof query !== 'string') {
    return {
      valid: false,
      error: 'Query must be a non-empty string'
    };
  }

  const tokens = scanTokens(query);

  if (tokens.length === 0) {
    return {
      valid: false,
      error: 'Query cannot be empty or contain only whitespace/comments'
    };
  }

  if (hasMultipleTopLevelStatements(tokens)) {
    return {
      valid: false,
      error: 'Query rejected: Multiple SQL statements are not allowed.'
    };
  }

  const classification = classifyQuery(tokens);

  if (!classification.allowed) {
    return {
      valid: false,
      error: classification.error
    };
  }

  const forbiddenClause = hasForbiddenClause(tokens);

  if (forbiddenClause) {
    return {
      valid: false,
      error: `Query rejected: Contains forbidden clause '${forbiddenClause}'. Data modification is not allowed.`
    };
  }

  return {
    valid: true,
    queryType: classification.queryType
  };
}

/**
 * Query Validator interface for dependency injection
 */
export interface QueryValidator {
  validate(query: string): ValidationResult;
  isReadOnly(query: string): boolean;
}

/**
 * Default query validator instance
 */
export const queryValidator: QueryValidator = {
  validate,
  isReadOnly
};
