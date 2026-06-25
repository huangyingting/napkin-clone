declare const redaction: {
  readonly REDACTED: "[redacted]";
  normalizeLogKey(key: string): string;
  isSensitiveKey(key: string): boolean;
  isContentKey(key: string): boolean;
  redactContext(context?: Record<string, unknown>): Record<string, unknown>;
  isSafeTelemetryScalar(value: unknown): value is string | number | boolean;
  buildSafeTelemetryContext(
    context?: Record<string, unknown>,
  ): Record<string, string | number | boolean>;
};

export = redaction;
