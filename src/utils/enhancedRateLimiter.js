import { log } from './logger.js';

class EnhancedRateLimiter {
  constructor() {
    this.limiters = new Map();
    this.strategies = {
      fixed: this.fixedWindowStrategy,
      sliding: this.slidingWindowStrategy,
      token: this.tokenBucketStrategy
    };
  }

  /**
   * Create a rate limiter
   * @param {string} key - Unique identifier for the limiter
   * @param {Object} options - Rate limiter options
   * @returns {Object} Rate limiter instance
   */
  createLimiter(key, options = {}) {
    const {
      maxRequests = 10,
      windowMs = 60000, // 1 minute
      strategy = 'fixed',
      burstSize = 5,
      burstWindowMs = 1000 // 1 second
    } = options;

    const limiter = {
      key,
      maxRequests,
      windowMs,
      strategy,
      burstSize,
      burstWindowMs,
      requests: [],
      burstRequests: [],
      lastReset: Date.now()
    };

    this.limiters.set(key, limiter);
    return limiter;
  }

  /**
   * Check if request is allowed
   * @param {string} key - Limiter key
   * @param {string} identifier - User/request identifier
   * @param {Object} options - Additional options
   * @returns {Object} Rate limit result
   */
  async checkLimit(key, identifier, options = {}) {
    const limiter = this.limiters.get(key);
    if (!limiter) {
      return { allowed: true, remaining: Infinity, resetTime: null };
    }

    const now = Date.now();
    const strategy = this.strategies[limiter.strategy];
    
    if (!strategy) {
      log.error(`Unknown rate limiting strategy: ${limiter.strategy}`);
      return { allowed: true, remaining: Infinity, resetTime: null };
    }

    return strategy.call(this, limiter, identifier, now, options);
  }

  /**
   * Fixed window rate limiting strategy
   * @param {Object} limiter - Rate limiter instance
   * @param {string} identifier - User identifier
   * @param {number} now - Current timestamp
   * @param {Object} options - Additional options
   * @returns {Object} Rate limit result
   */
  fixedWindowStrategy(limiter, identifier, now, options) {
    // Reset window if needed
    if (now - limiter.lastReset >= limiter.windowMs) {
      limiter.requests = [];
      limiter.lastReset = now;
    }

    // Check burst limit first
    const burstResult = this.checkBurstLimit(limiter, identifier, now);
    if (!burstResult.allowed) {
      return burstResult;
    }

    // Check main limit
    const userRequests = limiter.requests.filter(req => 
      req.identifier === identifier && 
      now - req.timestamp < limiter.windowMs
    );

    const remaining = Math.max(0, limiter.maxRequests - userRequests.length);
    const allowed = remaining > 0;

    if (allowed) {
      limiter.requests.push({
        identifier,
        timestamp: now,
        metadata: options.metadata || {}
      });
    }

    return {
      allowed,
      remaining,
      resetTime: limiter.lastReset + limiter.windowMs,
      retryAfter: allowed ? 0 : Math.ceil((limiter.lastReset + limiter.windowMs - now) / 1000)
    };
  }

  /**
   * Sliding window rate limiting strategy
   * @param {Object} limiter - Rate limiter instance
   * @param {string} identifier - User identifier
   * @param {number} now - Current timestamp
   * @param {Object} options - Additional options
   * @returns {Object} Rate limit result
   */
  slidingWindowStrategy(limiter, identifier, now, options) {
    // Remove old requests outside the window
    limiter.requests = limiter.requests.filter(req => 
      now - req.timestamp < limiter.windowMs
    );

    // Check burst limit
    const burstResult = this.checkBurstLimit(limiter, identifier, now);
    if (!burstResult.allowed) {
      return burstResult;
    }

    // Check main limit
    const userRequests = limiter.requests.filter(req => req.identifier === identifier);
    const remaining = Math.max(0, limiter.maxRequests - userRequests.length);
    const allowed = remaining > 0;

    if (allowed) {
      limiter.requests.push({
        identifier,
        timestamp: now,
        metadata: options.metadata || {}
      });
    }

    // Calculate reset time (oldest request + window)
    const oldestRequest = limiter.requests[0];
    const resetTime = oldestRequest ? oldestRequest.timestamp + limiter.windowMs : now + limiter.windowMs;

    return {
      allowed,
      remaining,
      resetTime,
      retryAfter: allowed ? 0 : Math.ceil((resetTime - now) / 1000)
    };
  }

  /**
   * Token bucket rate limiting strategy
   * @param {Object} limiter - Rate limiter instance
   * @param {string} identifier - User identifier
   * @param {number} now - Current timestamp
   * @param {Object} options - Additional options
   * @returns {Object} Rate limit result
   */
  tokenBucketStrategy(limiter, identifier, now, options) {
    // Initialize bucket for user if not exists
    if (!limiter.buckets) limiter.buckets = new Map();
    
    let bucket = limiter.buckets.get(identifier);
    if (!bucket) {
      bucket = {
        tokens: limiter.maxRequests,
        lastRefill: now,
        refillRate: limiter.maxRequests / (limiter.windowMs / 1000) // tokens per second
      };
      limiter.buckets.set(identifier, bucket);
    }

    // Refill tokens
    const timePassed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * bucket.refillRate;
    bucket.tokens = Math.min(limiter.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request is allowed
    const allowed = bucket.tokens >= 1;
    
    if (allowed) {
      bucket.tokens -= 1;
    }

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetTime: now + (limiter.maxRequests - bucket.tokens) / bucket.refillRate * 1000,
      retryAfter: allowed ? 0 : Math.ceil((1 - bucket.tokens) / bucket.refillRate)
    };
  }

  /**
   * Check burst limit
   * @param {Object} limiter - Rate limiter instance
   * @param {string} identifier - User identifier
   * @param {number} now - Current timestamp
   * @returns {Object} Burst limit result
   */
  checkBurstLimit(limiter, identifier, now) {
    // Remove old burst requests
    limiter.burstRequests = limiter.burstRequests.filter(req => 
      now - req.timestamp < limiter.burstWindowMs
    );

    const userBurstRequests = limiter.burstRequests.filter(req => req.identifier === identifier);
    const burstRemaining = Math.max(0, limiter.burstSize - userBurstRequests.length);
    const burstAllowed = burstRemaining > 0;

    if (burstAllowed) {
      limiter.burstRequests.push({
        identifier,
        timestamp: now
      });
    }

    return {
      allowed: burstAllowed,
      remaining: burstRemaining,
      resetTime: now + limiter.burstWindowMs,
      retryAfter: burstAllowed ? 0 : Math.ceil(limiter.burstWindowMs / 1000)
    };
  }

  /**
   * Get rate limit info for a key
   * @param {string} key - Limiter key
   * @param {string} identifier - User identifier
   * @returns {Object} Rate limit information
   */
  getLimitInfo(key, identifier) {
    const limiter = this.limiters.get(key);
    if (!limiter) return null;

    const now = Date.now();
    const userRequests = limiter.requests.filter(req => 
      req.identifier === identifier && 
      now - req.timestamp < limiter.windowMs
    );

    return {
      key,
      maxRequests: limiter.maxRequests,
      windowMs: limiter.windowMs,
      strategy: limiter.strategy,
      currentRequests: userRequests.length,
      remaining: Math.max(0, limiter.maxRequests - userRequests.length),
      resetTime: limiter.lastReset + limiter.windowMs
    };
  }

  /**
   * Reset rate limit for a user
   * @param {string} key - Limiter key
   * @param {string} identifier - User identifier
   */
  resetLimit(key, identifier) {
    const limiter = this.limiters.get(key);
    if (!limiter) return;

    limiter.requests = limiter.requests.filter(req => req.identifier !== identifier);
    limiter.burstRequests = limiter.burstRequests.filter(req => req.identifier !== identifier);
    
    if (limiter.buckets) {
      limiter.buckets.delete(identifier);
    }
  }

  /**
   * Get all active limiters
   * @returns {Array} Array of limiter information
   */
  getActiveLimiters() {
    return Array.from(this.limiters.entries()).map(([key, limiter]) => ({
      key,
      maxRequests: limiter.maxRequests,
      windowMs: limiter.windowMs,
      strategy: limiter.strategy,
      activeRequests: limiter.requests.length,
      activeBurstRequests: limiter.burstRequests.length
    }));
  }

  /**
   * Clear all limiters
   */
  clear() {
    this.limiters.clear();
  }
}

// Create singleton instance
const enhancedRateLimiter = new EnhancedRateLimiter();

// Pre-configure common limiters
enhancedRateLimiter.createLimiter('commands', {
  maxRequests: 20,
  windowMs: 60000,
  strategy: 'sliding',
  burstSize: 5,
  burstWindowMs: 1000
});

enhancedRateLimiter.createLimiter('api', {
  maxRequests: 100,
  windowMs: 60000,
  strategy: 'token',
  burstSize: 10,
  burstWindowMs: 1000
});

enhancedRateLimiter.createLimiter('moderation', {
  maxRequests: 5,
  windowMs: 60000,
  strategy: 'fixed',
  burstSize: 2,
  burstWindowMs: 5000
});

export default enhancedRateLimiter; 