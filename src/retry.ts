// Retry configuration and utilities for upload/download operations

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempt: number;
}

/**
 * Exponential backoff with jitter for retry logic
 */
export function calculateBackoff(attempt: number, options: RetryOptions): number {
  const {
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
  } = options;

  // Calculate exponential backoff
  const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);

  // Add jitter to avoid thundering herd
  if (jitter) {
    return delay * (0.5 + Math.random() * 0.5);
  }

  return delay;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  // Network errors, timeouts, 5xx errors are retryable
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes("timeout")) return true;
  if (errorMessage.includes("econnrefused")) return true;
  if (errorMessage.includes("econnreset")) return true;
  if (errorMessage.includes("enotfound")) return false; // Don't retry 404
  if (errorMessage.includes("econnaborted")) return true;
  
  // Check for HTTP status codes if present
  const statusMatch = errorMessage.match(/\b(\d{3})\b/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    return status >= 500 || status === 429; // Retry 5xx and 429
  }
  
  return false;
}

/**
 * Async sleep/delay utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
  } = options;

  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await operation();
      return {
        success: true,
        data,
        attempt,
      };
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if error is not retryable
      if (!isRetryableError(lastError)) {
        return {
          success: false,
          error: lastError,
          attempt,
        };
      }
      
      // Don't delay after last attempt
      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, options);
        await sleep(delay);
      }
    }
  }
  
  return {
    success: false,
    error: lastError!,
    attempt: maxRetries,
  };
}
