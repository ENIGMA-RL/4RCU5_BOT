import logger from '../utils/logger.js';

const jobs = new Map();

function withJitter(baseMs, jitterMs) {
  if (!jitterMs || jitterMs <= 0) return baseMs;
  const extra = Math.floor(Math.random() * jitterMs);
  return baseMs + extra;
}

/**
 * Register a periodic job
 * @param {string} name
 * @param {() => Promise<void>|() => void} fn
 * @param {number} intervalMs
 * @param {{ jitterMs?: number, singleton?: boolean }} opts
 */
export function registerJob(name, fn, intervalMs, opts = {}) {
  if (jobs.has(name)) {
    throw new Error(`Job already registered: ${name}`);
  }
  const state = {
    name,
    fn,
    intervalMs,
    jitterMs: opts.jitterMs || 0,
    singleton: Boolean(opts.singleton),
    handle: null,
    running: false
  };
  jobs.set(name, state);
}

function schedule(state) {
  const delay = withJitter(state.intervalMs, state.jitterMs);
  state.handle = setTimeout(async () => {
    if (state.singleton && state.running) {
      logger.debug(`Job ${state.name} skipped (singleton in-flight)`);
      schedule(state);
      return;
    }
    try {
      state.running = true;
      await state.fn();
    } catch (err) {
      logger.error({ err }, `Job ${state.name} failed`);
    } finally {
      state.running = false;
      schedule(state);
    }
  }, delay);
}

export function startJob(name) {
  const state = jobs.get(name);
  if (!state) throw new Error(`Job not found: ${name}`);
  if (state.handle) return;
  schedule(state);
  logger.info(`Job started: ${name}`);
}

export function stopJob(name) {
  const state = jobs.get(name);
  if (!state) return;
  if (state.handle) {
    clearTimeout(state.handle);
    state.handle = null;
    logger.info(`Job stopped: ${name}`);
  }
}

export function startAll() {
  for (const name of jobs.keys()) startJob(name);
}

export function stopAll() {
  for (const name of jobs.keys()) stopJob(name);
}


