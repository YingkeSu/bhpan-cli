import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/network.ts";
import {
  calculateBackoff,
  isRetryableError,
  retryWithBackoff,
  sleep,
  type RetryOptions,
} from "../src/retry.ts";

describe("isRetryableError", () => {
  it("returns true for ApiError with 5xx status", () => {
    const error = new ApiError("Internal Server Error", 500, {});
    assert.equal(isRetryableError(error), true);
  });

  it("returns true for ApiError with 502 status", () => {
    const error = new ApiError("Bad Gateway", 502, {});
    assert.equal(isRetryableError(error), true);
  });

  it("returns true for ApiError with 503 status", () => {
    const error = new ApiError("Service Unavailable", 503, {});
    assert.equal(isRetryableError(error), true);
  });

  it("returns true for ApiError with 429 status (rate limit)", () => {
    const error = new ApiError("Too Many Requests", 429, {});
    assert.equal(isRetryableError(error), true);
  });

  it("returns false for ApiError with 4xx status (except 429)", () => {
    const error400 = new ApiError("Bad Request", 400, {});
    const error401 = new ApiError("Unauthorized", 401, {});
    const error403 = new ApiError("Forbidden", 403, {});
    const error404 = new ApiError("Not Found", 404, {});

    assert.equal(isRetryableError(error400), false);
    assert.equal(isRetryableError(error401), false);
    assert.equal(isRetryableError(error403), false);
    assert.equal(isRetryableError(error404), false);
  });

  it("returns true for timeout errors (message-based)", () => {
    const error = new Error("Request timeout after 30000ms");
    assert.equal(isRetryableError(error), true);
  });

  it("returns true for ECONNREFUSED errors (message-based)", () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:443");
    assert.equal(isRetryableError(error), true);
  });

  it("returns true for ECONNRESET errors (message-based)", () => {
    const error = new Error("read ECONNRESET");
    assert.equal(isRetryableError(error), true);
  });

  it("returns true for ECONNABORTED errors (message-based)", () => {
    const error = new Error("socket hang up ECONNABORTED");
    assert.equal(isRetryableError(error), true);
  });

  it("returns false for ENOTFOUND errors (message-based)", () => {
    const error = new Error("getaddrinfo ENOTFOUND example.com");
    assert.equal(isRetryableError(error), false);
  });

  it("returns false for unknown errors", () => {
    const error = new Error("Some random error");
    assert.equal(isRetryableError(error), false);
  });

  it("returns true for 5xx status in error message", () => {
    const error = new Error("HTTP 503 Service Unavailable");
    assert.equal(isRetryableError(error), true);
  });

  it("returns true for 429 status in error message", () => {
    const error = new Error("HTTP 429 Too Many Requests");
    assert.equal(isRetryableError(error), true);
  });
});

describe("calculateBackoff", () => {
  it("returns initial delay for attempt 0", () => {
    const options: RetryOptions = { initialDelay: 1000, maxDelay: 30000, backoffMultiplier: 2, jitter: false };
    const delay = calculateBackoff(0, options);
    assert.equal(delay, 1000);
  });

  it("multiplies delay by backoffMultiplier for each attempt", () => {
    const options: RetryOptions = { initialDelay: 1000, maxDelay: 30000, backoffMultiplier: 2, jitter: false };
    assert.equal(calculateBackoff(1, options), 2000);
    assert.equal(calculateBackoff(2, options), 4000);
    assert.equal(calculateBackoff(3, options), 8000);
  });

  it("caps delay at maxDelay", () => {
    const options: RetryOptions = { initialDelay: 1000, maxDelay: 5000, backoffMultiplier: 2, jitter: false };
    assert.equal(calculateBackoff(10, options), 5000);
  });

  it("applies jitter when enabled", () => {
    const options: RetryOptions = { initialDelay: 1000, jitter: true };
    // Run multiple times to ensure jitter is applied (result should vary)
    const delays = new Set<number>();
    for (let i = 0; i < 10; i++) {
      delays.add(calculateBackoff(0, options));
    }
    // With jitter, we expect some variation (but could theoretically be same)
    // At minimum, all delays should be in range [500, 1000] (0.5 to 1.0 of initial)
    for (const d of delays) {
      assert.ok(d >= 500 && d <= 1000, `delay ${d} not in expected range`);
    }
  });
});

describe("sleep", () => {
  it("resolves after specified milliseconds", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    // Allow some variance in timing
    assert.ok(elapsed >= 40, `sleep took ${elapsed}ms, expected at least 40ms`);
  });
});

describe("retryWithBackoff", () => {
  it("returns success on first attempt if operation succeeds", async () => {
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      return "success";
    });

    assert.equal(result.success, true);
    assert.equal(result.data, "success");
    assert.equal(result.attempt, 0);
    assert.equal(calls, 1);
  });

  it("retries on retryable errors", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 3) {
          throw new ApiError("Service Unavailable", 503, {});
        }
        return "success";
      },
      { maxRetries: 3, initialDelay: 10, jitter: false },
    );

    assert.equal(result.success, true);
    assert.equal(result.data, "success");
    assert.equal(result.attempt, 2);
    assert.equal(calls, 3);
  });

  it("returns failure immediately on non-retryable error", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        throw new ApiError("Not Found", 404, {});
      },
      { maxRetries: 3, initialDelay: 10 },
    );

    assert.equal(result.success, false);
    assert.equal(result.attempt, 0);
    assert.equal(calls, 1);
    assert.ok(result.error instanceof ApiError);
    assert.equal((result.error as ApiError).statusCode, 404);
  });

  it("returns failure after maxRetries exhausted", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        throw new ApiError("Service Unavailable", 503, {});
      },
      { maxRetries: 2, initialDelay: 10, jitter: false },
    );

    assert.equal(result.success, false);
    assert.equal(result.attempt, 2);
    assert.equal(calls, 3); // initial + 2 retries
    assert.ok(result.error instanceof ApiError);
  });

  it("respects maxRetries option", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        throw new Error("timeout");
      },
      { maxRetries: 1, initialDelay: 10, jitter: false },
    );

    assert.equal(result.success, false);
    assert.equal(result.attempt, 1);
    assert.equal(calls, 2); // initial + 1 retry
  });

  it("works with timeout error messages", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) {
          throw new Error("Request timeout after 30000ms");
        }
        return "success";
      },
      { maxRetries: 3, initialDelay: 10, jitter: false },
    );

    assert.equal(result.success, true);
    assert.equal(result.attempt, 1);
    assert.equal(calls, 2);
  });
});
