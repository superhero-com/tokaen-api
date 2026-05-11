import {
  MAX_RETRIES_WHEN_REQUEST_FAILED,
  WAIT_TIME_WHEN_REQUEST_FAILED,
} from '@/configs/constants';

/**
 * Thrown when a request fails due to a condition that is expected to be
 * temporary: MDW/node overload (429, 502, 503, 504), connection-level errors
 * (ECONNREFUSED, ETIMEDOUT), or explicit "dry-run overload" messages from the
 * AE SDK.  Callers and queue retry logic can check `instanceof TransientError`
 * to apply exponential back-off rather than treating these as permanent failures.
 */
export class TransientError extends Error {
  /** Suggested delay in ms before the next retry (0 = use caller's own backoff). */
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs = 0) {
    super(message);
    this.name = 'TransientError';
    this.retryAfterMs = retryAfterMs;
  }

  /** Returns true if the given error should be treated as transient. */
  static is(error: unknown): error is TransientError {
    if (error instanceof TransientError) return true;
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return (
      msg.includes('overload') ||
      msg.includes('too many requests') ||
      msg.includes('rate limit') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('network') ||
      msg.includes('socket hang up') ||
      msg.includes('fetch failed')
    );
  }
}

// HTTP status codes that indicate a transient server-side condition.
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Fetches JSON data from the specified URL.
 *
 * @param url - The URL to fetch the JSON data from.
 * @param options - Optional request options.
 * @returns A promise that resolves to the JSON data or null if the response status is 204.
 */
export async function fetchJson<T = any>(
  url: string,
  options?: RequestInit,
  shouldNotRetry = false,
  totalRetries = 1,
): Promise<T | null> {
  try {
    const response = await fetch(url, options);
    if (response.status === 204) {
      return null;
    }
    if (TRANSIENT_STATUS_CODES.has(response.status)) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : 0;
      throw new TransientError(
        `HTTP ${response.status} from ${url}`,
        retryAfterMs,
      );
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (totalRetries < MAX_RETRIES_WHEN_REQUEST_FAILED && !shouldNotRetry) {
      totalRetries++;
      await new Promise((resolve) =>
        setTimeout(resolve, WAIT_TIME_WHEN_REQUEST_FAILED),
      );
      return fetchJson(url, options, shouldNotRetry, totalRetries);
    }
    // After all retries exhausted, re-wrap low-level network errors as
    // TransientError so callers get a consistent type without having to
    // pattern-match on string messages.
    if (!(error instanceof TransientError) && TransientError.is(error)) {
      throw new TransientError((error as Error).message);
    }
    throw error;
  }
}
