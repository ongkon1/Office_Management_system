const forbiddenKey = /password|passphrase|secret|token|credential|authorization|cookie|salary|cost.?rate|labour.?cost|evaluation/i;

export function redactProtected(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProtected);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, forbiddenKey.test(key) ? '[REDACTED]' : redactProtected(child)]));
}

export function prohibitImpersonation(): never {
  throw new Error('Administrative impersonation is not approved');
}
