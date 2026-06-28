/**
 * Tests for the structured error-code taxonomy (issue #460).
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  buildDiagnostic,
  buildDiagnosticErrorLog,
  authDiagnosticDenied,
  assetDiagnosticMissing,
  budgetDiagnosticExceeded,
  commandDiagnosticUnsupported,
  deckDiagnosticInvalid,
  exportDiagnosticFallback,
  exportDiagnosticFatal,
  projectionDiagnosticFailed,
  saveDiagnosticConflict,
  saveDiagnosticOversized,
  visualDiagnosticInvalid,
  CODE_SEVERITY,
  ERROR_CODES,
  logDiagnostic,
  type DiagnosticRecord,
} from "./error-codes";

// ---------------------------------------------------------------------------
// Error code taxonomy completeness
// ---------------------------------------------------------------------------

describe("error-code taxonomy (#460)", () => {
  test("every ERROR_CODES value has a canonical severity", () => {
    for (const code of Object.values(ERROR_CODES)) {
      assert.ok(
        code in CODE_SEVERITY,
        `ERROR_CODES.${code} is missing a CODE_SEVERITY entry`,
      );
    }
  });

  test("CODE_SEVERITY contains no extra codes", () => {
    const codeSet = new Set(Object.values(ERROR_CODES));
    for (const code of Object.keys(CODE_SEVERITY)) {
      assert.ok(
        codeSet.has(code as never),
        `CODE_SEVERITY has unknown code: ${code}`,
      );
    }
  });

  test("all severities are one of the three allowed values", () => {
    const valid = new Set(["fatal", "error", "warning"]);
    for (const [code, sev] of Object.entries(CODE_SEVERITY)) {
      assert.ok(valid.has(sev), `${code} has invalid severity: ${sev}`);
    }
  });
});

// ---------------------------------------------------------------------------
// buildDiagnostic
// ---------------------------------------------------------------------------

describe("buildDiagnostic", () => {
  test("derives severity from CODE_SEVERITY", () => {
    const d = buildDiagnostic(
      ERROR_CODES.SAVE_CONFLICT,
      "save.deck",
      "conflict",
    );
    assert.equal(d.code, ERROR_CODES.SAVE_CONFLICT);
    assert.equal(d.severity, CODE_SEVERITY.SAVE_CONFLICT);
    assert.equal(d.scope, "save.deck");
  });

  test("EXPORT_FALLBACK has warning severity", () => {
    const d = buildDiagnostic(
      ERROR_CODES.EXPORT_FALLBACK,
      "export",
      "fallback",
    );
    assert.equal(d.severity, "warning");
  });

  test("meta is included in record", () => {
    const d = buildDiagnostic(ERROR_CODES.PERMISSION_DENIED, "auth", "denied", {
      documentId: "doc-1",
      userId: "user-1",
    });
    assert.equal(d.meta.documentId, "doc-1");
    assert.equal(d.meta.userId, "user-1");
  });
});

// ---------------------------------------------------------------------------
// buildDiagnosticErrorLog
// ---------------------------------------------------------------------------

describe("buildDiagnosticErrorLog", () => {
  test("merges code and severity into error log record", () => {
    const d = buildDiagnostic(
      ERROR_CODES.SAVE_CONFLICT,
      "save.deck",
      "conflict detected",
      { documentId: "doc-abc" },
    );
    const rec = buildDiagnosticErrorLog(d);
    assert.equal(rec.level, "error");
    assert.equal(rec.code, ERROR_CODES.SAVE_CONFLICT);
    assert.equal(rec.severity, "error");
    assert.equal(rec.scope, "save.deck");
    assert.equal(typeof rec.timestamp, "string");
  });

  test("uses provided error object for message/stack", () => {
    const err = new TypeError("test error");
    const d = buildDiagnostic(ERROR_CODES.INVALID_DECK, "save.deck", "invalid");
    const rec = buildDiagnosticErrorLog(d, err);
    assert.equal(rec.errorName, "TypeError");
    assert.equal(rec.message, "test error");
  });

  test("code field is not redacted despite being in context", () => {
    const d = buildDiagnostic(ERROR_CODES.PERMISSION_DENIED, "auth", "denied");
    const rec = buildDiagnosticErrorLog(d);
    // code is injected as a top-level field, not via context keys
    assert.equal(rec.code, ERROR_CODES.PERMISSION_DENIED);
  });

  test("uses diagnostic message and safe metadata when no error is supplied", () => {
    const d = buildDiagnostic(
      ERROR_CODES.BUDGET_EXCEEDED,
      "deck.autosave",
      "Autosave budget exceeded.",
      { metric: "durationMs", actual: 1200, budget: 1000 },
    );

    const rec = buildDiagnosticErrorLog(d);

    assert.equal(rec.message, "Autosave budget exceeded.");
    assert.equal(rec.errorName, "Error");
    assert.equal(rec.metric, "durationMs");
    assert.equal(rec.actual, 1200);
    assert.equal(rec.budget, 1000);
  });
});

// ---------------------------------------------------------------------------
// logDiagnostic smoke test (does not throw)
// ---------------------------------------------------------------------------

describe("logDiagnostic", () => {
  test("does not throw for any error code", () => {
    for (const code of Object.values(ERROR_CODES)) {
      const d = buildDiagnostic(code, "test", "smoke test");
      assert.doesNotThrow(() => logDiagnostic(d));
    }
  });
});

// ---------------------------------------------------------------------------
// Convenience builders
// ---------------------------------------------------------------------------

describe("convenience diagnostic builders (#460)", () => {
  test("saveDiagnosticConflict: correct code, scope, meta", () => {
    const d = saveDiagnosticConflict("doc-1");
    assert.equal(d.code, ERROR_CODES.SAVE_CONFLICT);
    assert.equal(d.scope, "save.deck");
    assert.equal(d.meta.documentId, "doc-1");
  });

  test("saveDiagnosticOversized: records actual and max bytes", () => {
    const d = saveDiagnosticOversized("doc-1", 600_000, 500_000);
    assert.equal(d.code, ERROR_CODES.SAVE_OVERSIZED);
    assert.equal(d.meta.actualBytes, 600_000);
    assert.equal(d.meta.maxBytes, 500_000);
  });

  test("deckDiagnosticInvalid: correct code", () => {
    const d = deckDiagnosticInvalid("doc-1");
    assert.equal(d.code, ERROR_CODES.INVALID_DECK);
  });

  test("authDiagnosticDenied: records userId, documentId, capability", () => {
    const d = authDiagnosticDenied("user-1", "doc-1", "edit");
    assert.equal(d.code, ERROR_CODES.PERMISSION_DENIED);
    assert.equal(d.meta.userId, "user-1");
    assert.equal(d.meta.documentId, "doc-1");
    assert.equal(d.meta.capability, "edit");
  });

  test("visualDiagnosticInvalid: records anchorBlockId and type", () => {
    const d = visualDiagnosticInvalid("doc-1", "bid-abc", "flowchart");
    assert.equal(d.code, ERROR_CODES.INVALID_VISUAL);
    assert.equal(d.meta.anchorBlockId, "bid-abc");
    assert.equal(d.meta.visualType, "flowchart");
  });

  test("projectionDiagnosticFailed: correct code and scope", () => {
    const d = projectionDiagnosticFailed("doc-1");
    assert.equal(d.code, ERROR_CODES.PROJECTION_REPAIR_FAILED);
    assert.equal(d.scope, "visual.rebuild");
  });

  test("exportDiagnosticFatal: records fatalCount", () => {
    const d = exportDiagnosticFatal("doc-1", 3);
    assert.equal(d.code, ERROR_CODES.EXPORT_PREFLIGHT_FATAL);
    assert.equal(d.severity, "fatal");
    assert.equal(d.meta.fatalCount, 3);
  });

  test("exportDiagnosticFallback: records warningCount", () => {
    const d = exportDiagnosticFallback("doc-1", 2);
    assert.equal(d.code, ERROR_CODES.EXPORT_FALLBACK);
    assert.equal(d.severity, "warning");
    assert.equal(d.meta.warningCount, 2);
  });

  test("assetDiagnosticMissing: records elementId", () => {
    const d = assetDiagnosticMissing("doc-1", "el-img-1");
    assert.equal(d.code, ERROR_CODES.MISSING_ASSET);
    assert.equal(d.meta.elementId, "el-img-1");
  });

  test("commandDiagnosticUnsupported: records op", () => {
    const d = commandDiagnosticUnsupported("slide.teleport");
    assert.equal(d.code, ERROR_CODES.UNSUPPORTED_COMMAND);
    assert.equal(d.meta.op, "slide.teleport");
  });

  test("budgetDiagnosticExceeded: records metric, actual, budget", () => {
    const d = budgetDiagnosticExceeded(
      "deck.autosave",
      "deckJsonBytes",
      600_000,
      500_000,
    );
    assert.equal(d.code, ERROR_CODES.BUDGET_EXCEEDED);
    assert.equal(d.severity, "warning");
    assert.equal(d.meta.metric, "deckJsonBytes");
    assert.equal(d.meta.actual, 600_000);
    assert.equal(d.meta.budget, 500_000);
  });

  test("diagnostic records contain no PII or raw content fields", () => {
    // Verify no convenience builder leaks content-bearing fields.
    const diagnostics: DiagnosticRecord[] = [
      saveDiagnosticConflict("doc-1"),
      saveDiagnosticOversized("doc-1", 600_000, 500_000),
      deckDiagnosticInvalid("doc-1"),
      authDiagnosticDenied("u-1", "d-1", "edit"),
      visualDiagnosticInvalid("d-1", "bid-1", "chart"),
      projectionDiagnosticFailed("d-1"),
      exportDiagnosticFatal("d-1", 1),
      exportDiagnosticFallback("d-1", 2),
      assetDiagnosticMissing("d-1", "el-1"),
      commandDiagnosticUnsupported("noop"),
      budgetDiagnosticExceeded("s", "m", 1, 2),
    ];
    const piiKeys = new Set([
      "text",
      "content",
      "body",
      "title",
      "input",
      "prompt",
    ]);
    for (const d of diagnostics) {
      for (const key of Object.keys(d.meta)) {
        assert.ok(
          !piiKeys.has(key.toLowerCase()),
          `Diagnostic ${d.code} meta contains PII-risk key: ${key}`,
        );
      }
    }
  });
});
