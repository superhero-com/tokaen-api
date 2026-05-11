import BigNumber from 'bignumber.js';
import { BigNumberTransformer } from './BigNumberTransformer';
import { fetchJson, TransientError } from './common';

// Mock the global fetch function
global.fetch = jest.fn();

describe('fetchJson', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch JSON data and return the parsed response', async () => {
    const mockData = { message: 'Success' };
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue(mockData),
    });

    const result = await fetchJson('https://api.example.com/data');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      undefined,
    );
    expect(result).toEqual(mockData);
  });

  it('should return null for status 204 (No Content)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 204,
    });

    const result = await fetchJson('https://api.example.com/no-content');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/no-content',
      undefined,
    );
    expect(result).toBeNull();
  });

  it('should pass request options when provided', async () => {
    const mockData = { message: 'Success' };
    const mockOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue(mockData),
    });

    const result = await fetchJson('https://api.example.com/data', mockOptions);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      mockOptions,
    );
    expect(result).toEqual(mockData);
  });

  it('should throw an error if fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    // shouldNotRetry=true to skip the retry loop; after exhausting retries the
    // low-level network error is re-wrapped as TransientError.
    await expect(
      fetchJson('https://api.example.com/error', undefined, true),
    ).rejects.toThrow(TransientError);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/error',
      undefined,
    );
  });

  it('should throw TransientError for 429 responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 429,
      headers: { get: () => null },
    });

    // Pass shouldNotRetry=true to avoid the 10-retry loop in tests
    await expect(
      fetchJson('https://api.example.com/rate-limited', undefined, true),
    ).rejects.toThrow(TransientError);
  });

  it('should throw TransientError for 5xx responses', async () => {
    for (const status of [500, 502, 503, 504]) {
      (global.fetch as jest.Mock).mockResolvedValue({
        status,
        headers: { get: () => null },
      });

      await expect(
        fetchJson('https://api.example.com/error', undefined, true),
      ).rejects.toThrow(TransientError);
    }
  });

  it('should honour Retry-After header in TransientError', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 429,
      headers: { get: (h: string) => (h === 'Retry-After' ? '30' : null) },
    });

    const err = await fetchJson(
      'https://api.example.com/rate-limited',
      undefined,
      true,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(TransientError);
    expect((err as TransientError).retryAfterMs).toBe(30_000);
  });
});

describe('BigNumberTransformer', () => {
  describe('from', () => {
    it('should return null when input is null', () => {
      expect(BigNumberTransformer.from(null)).toBeNull();
    });

    it('should return undefined when input is undefined', () => {
      expect(BigNumberTransformer.from(undefined)).toBeUndefined();
    });

    it('should convert a numeric string to a BigNumber', () => {
      const result = BigNumberTransformer.from('123.45');
      expect(result).toBeInstanceOf(BigNumber);
      expect(result?.toString()).toBe('123.45');
    });

    it('should convert a number to a BigNumber', () => {
      const result = BigNumberTransformer.from(123.45);
      expect(result).toBeInstanceOf(BigNumber);
      expect(result?.toString()).toBe('123.45');
    });
  });

  describe('to', () => {
    it('should return null when input is null', () => {
      expect(BigNumberTransformer.to(null)).toBeNull();
    });

    it('should return undefined when input is undefined', () => {
      expect(BigNumberTransformer.to(undefined)).toBeUndefined();
    });

    it('should convert a BigNumber to a string', () => {
      const bigNumber = new BigNumber('123.45');
      expect(BigNumberTransformer.to(bigNumber)).toBe('123.45');
    });
  });
});

describe('TransientError', () => {
  it('should be an instance of Error', () => {
    const err = new TransientError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TransientError);
    expect(err.name).toBe('TransientError');
    expect(err.message).toBe('test');
  });

  it('should default retryAfterMs to 0', () => {
    expect(new TransientError('x').retryAfterMs).toBe(0);
  });

  it('should store retryAfterMs when provided', () => {
    expect(new TransientError('x', 5000).retryAfterMs).toBe(5000);
  });

  describe('is()', () => {
    it('returns true for a TransientError instance', () => {
      expect(TransientError.is(new TransientError('t'))).toBe(true);
    });

    it('returns true for overload/rate-limit messages', () => {
      expect(TransientError.is(new Error('overload detected'))).toBe(true);
      expect(TransientError.is(new Error('Too Many Requests'))).toBe(true);
      expect(TransientError.is(new Error('rate limit exceeded'))).toBe(true);
    });

    it('returns true for network-level messages', () => {
      expect(TransientError.is(new Error('ECONNREFUSED'))).toBe(true);
      expect(TransientError.is(new Error('ECONNRESET'))).toBe(true);
      expect(TransientError.is(new Error('ETIMEDOUT'))).toBe(true);
      expect(TransientError.is(new Error('socket hang up'))).toBe(true);
      expect(TransientError.is(new Error('fetch failed'))).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(TransientError.is(new Error('Not Found'))).toBe(false);
      expect(TransientError.is(new Error('Unauthorized'))).toBe(false);
      expect(TransientError.is(new Error('Invalid networkId'))).toBe(false);
      expect(TransientError.is(new Error('Unsupported network configuration'))).toBe(false);
      expect(TransientError.is(null)).toBe(false);
      expect(TransientError.is('string')).toBe(false);
    });
  });
});
