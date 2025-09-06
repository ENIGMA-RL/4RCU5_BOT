import Bottleneck from 'bottleneck';
import fetch from 'node-fetch';
import logger from './logger.js';

// Shared limiter: modest pace to smooth bursts
const limiter = new Bottleneck({
  minTime: 80,
  maxConcurrent: 1
});

// Simple circuit breaker
let circuitOpenUntil = 0;
let consecutiveFailures = 0;

export function isCircuitOpen() {
  return Date.now() < circuitOpenUntil;
}

export function getCircuitReset() {
  return circuitOpenUntil;
}

function openCircuit(ms) {
  circuitOpenUntil = Math.max(circuitOpenUntil, Date.now() + ms);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch with retries, handling 429 and 5xx, with circuit breaker support.
 * @param {string} url
 * @param {RequestInit} options
 * @param {{ maxRetries?: number, name?: string }} opts
 */
export async function fetchWithBackoff(url, options = {}, opts = {}) {
  const maxRetries = opts.maxRetries ?? 4;
  const name = opts.name || 'request';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (isCircuitOpen()) {
      const waitMs = Math.max(0, getCircuitReset() - Date.now());
      logger.warn({ waitMs }, `[${name}] Circuit open, delaying request`);
      await sleep(waitMs);
    }

    try {
      const res = await limiter.schedule(() => fetch(url, options));

      // 2xx OK
      if (res.ok) {
        consecutiveFailures = 0;
        return res;
      }

      // 429: respect retry-after
      if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get('retry-after') || 1);
        const retryMs = Math.min(60_000, Math.max(1000, retryAfterSec * 1000));
        openCircuit(retryMs);
        logger.warn({ status: res.status, retryMs }, `[${name}] Rate limited`);
      } else if (res.status >= 500 && res.status < 600) {
        // 5xx: exponential backoff
        const backoffMs = Math.min(10_000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250);
        openCircuit(Math.min(5_000, backoffMs));
        logger.warn({ status: res.status, backoffMs }, `[${name}] Server error`);
      } else {
        // Non-retryable
        return res;
      }
    } catch (err) {
      // Network error: backoff too
      const backoffMs = Math.min(10_000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250);
      openCircuit(Math.min(5_000, backoffMs));
      consecutiveFailures += 1;
      logger.warn({ err, backoffMs }, `[${name}] Network error`);
    }

    if (attempt < maxRetries) {
      const waitMs = Math.max(0, getCircuitReset() - Date.now());
      await sleep(waitMs || 500);
    }
  }

  throw new Error(`[${name}] Exhausted retries`);
}

export default fetchWithBackoff;


