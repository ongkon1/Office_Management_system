const SENSITIVE_KEY = /(?:authorization|cookie|password|secret|token|credential|session|salary|cost|rate|evaluation|file|content|payload)/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const MYSQL_URL = /mysql:\/\/[^\s/@:]+(?::[^\s/@]*)?@/gi;

/**
 * Observability accepts only small, explicitly safe diagnostic values.
 * Anything resembling a credential or protected business field is redacted
 * before it reaches a logger, metric label, alert, or error monitor.
 */
export function safeObservabilityData(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value
      .slice(0, 500)
      .replace(BEARER, 'Bearer [redacted]')
      .replace(MYSQL_URL, 'mysql://[redacted]@');
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeObservabilityData(item, depth + 1));
  if (typeof value !== 'object') return String(value);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : safeObservabilityData(item, depth + 1),
      ]),
  );
}

