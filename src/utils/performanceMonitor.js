import { log } from './logger.js';

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      commands: new Map(),
      events: new Map(),
      database: new Map(),
      memory: [],
      uptime: Date.now()
    };
    
    this.thresholds = {
      commandSlow: 1000, // 1 second
      eventSlow: 500,    // 500ms
      dbSlow: 100,       // 100ms
      memoryHigh: 0.8    // 80% of available memory
    };
  }

  /**
   * Start timing an operation
   * @param {string} category - Category of operation (commands, events, database)
   * @param {string} name - Name of the operation
   * @returns {Function} Function to call when operation completes
   */
  startTimer(category, name) {
    const startTime = process.hrtime.bigint();
    
    return (metadata = {}) => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      this.recordMetric(category, name, duration, metadata);
      return duration;
    };
  }

  /**
   * Record a performance metric
   * @param {string} category - Category of operation
   * @param {string} name - Name of the operation
   * @param {number} duration - Duration in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  recordMetric(category, name, duration, metadata = {}) {
    const key = `${category}:${name}`;
    const existing = this.metrics[category].get(key) || {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      avgTime: 0,
      lastUsed: null
    };

    const updated = {
      count: existing.count + 1,
      totalTime: existing.totalTime + duration,
      minTime: Math.min(existing.minTime, duration),
      maxTime: Math.max(existing.maxTime, duration),
      avgTime: (existing.totalTime + duration) / (existing.count + 1),
      lastUsed: new Date().toISOString()
    };

    this.metrics[category].set(key, updated);

    // Log slow operations
    const threshold = this.thresholds[`${category}Slow`];
    if (threshold && duration > threshold) {
      log.warn(`Slow ${category} operation detected`, {
        operation: name,
        duration: `${duration.toFixed(2)}ms`,
        threshold: `${threshold}ms`,
        ...metadata
      });
    }
  }

  /**
   * Monitor memory usage
   */
  monitorMemory() {
    const usage = process.memoryUsage();
    const memoryInfo = {
      timestamp: new Date().toISOString(),
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers
    };

    this.metrics.memory.push(memoryInfo);

    // Keep only last 100 memory readings
    if (this.metrics.memory.length > 100) {
      this.metrics.memory.shift();
    }

    // Check for high memory usage
    const memoryUsage = usage.heapUsed / usage.heapTotal;
    if (memoryUsage > this.thresholds.memoryHigh) {
      log.warn('High memory usage detected', {
        usage: `${(memoryUsage * 100).toFixed(2)}%`,
        heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`
      });
    }
  }

  /**
   * Get performance statistics
   * @param {string} category - Category to get stats for (optional)
   * @returns {Object} Performance statistics
   */
  getStats(category = null) {
    if (category) {
      if (category === 'memory') {
        return {
          [category]: {
            current: this.metrics[category][this.metrics[category].length - 1] || null,
            average: this.calculateAverageMemory(this.metrics[category])
          }
        };
      } else if (category === 'uptime') {
        return {
          [category]: Date.now() - this.metrics.uptime
        };
      } else if (this.metrics[category] instanceof Map) {
        return {
          [category]: Object.fromEntries(this.metrics[category])
        };
      } else {
        return {
          [category]: this.metrics[category]
        };
      }
    }

    const stats = {};
    for (const [cat, metrics] of Object.entries(this.metrics)) {
      if (cat === 'memory') {
        stats[cat] = {
          current: metrics[metrics.length - 1] || null,
          average: this.calculateAverageMemory(metrics)
        };
      } else if (cat === 'uptime') {
        stats[cat] = Date.now() - this.metrics.uptime;
      } else if (metrics instanceof Map) {
        stats[cat] = Object.fromEntries(metrics);
      } else {
        stats[cat] = metrics;
      }
    }

    return stats;
  }

  /**
   * Calculate average memory usage
   * @param {Array} memoryReadings - Array of memory readings
   * @returns {Object} Average memory usage
   */
  calculateAverageMemory(memoryReadings) {
    if (memoryReadings.length === 0) return null;

    const totals = memoryReadings.reduce((acc, reading) => ({
      rss: acc.rss + reading.rss,
      heapUsed: acc.heapUsed + reading.heapUsed,
      heapTotal: acc.heapTotal + reading.heapTotal,
      external: acc.external + reading.external,
      arrayBuffers: acc.arrayBuffers + reading.arrayBuffers
    }), { rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 });

    const count = memoryReadings.length;
    return {
      rss: totals.rss / count,
      heapUsed: totals.heapUsed / count,
      heapTotal: totals.heapTotal / count,
      external: totals.external / count,
      arrayBuffers: totals.arrayBuffers / count
    };
  }

  /**
   * Get slowest operations
   * @param {string} category - Category to check
   * @param {number} limit - Number of operations to return
   * @returns {Array} Array of slowest operations
   */
  getSlowestOperations(category, limit = 10) {
    if (!this.metrics[category] || !(this.metrics[category] instanceof Map)) {
      return [];
    }

    const operations = Array.from(this.metrics[category].entries())
      .map(([key, stats]) => ({
        name: key.split(':')[1],
        category: key.split(':')[0],
        avgTime: stats.avgTime,
        maxTime: stats.maxTime,
        count: stats.count,
        lastUsed: stats.lastUsed
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);

    return operations;
  }

  /**
   * Reset metrics
   * @param {string} category - Category to reset (optional)
   */
  reset(category = null) {
    if (category) {
      if (category === 'memory') {
        this.metrics[category] = [];
      } else {
        this.metrics[category] = new Map();
      }
    } else {
      for (const cat of Object.keys(this.metrics)) {
        if (cat === 'memory') {
          this.metrics[cat] = [];
        } else {
          this.metrics[cat] = new Map();
        }
      }
      this.metrics.uptime = Date.now();
    }
  }

  /**
   * Start periodic monitoring
   * @param {number} interval - Monitoring interval in milliseconds
   */
  startPeriodicMonitoring(interval = 60000) { // Default: 1 minute
    setInterval(() => {
      this.monitorMemory();
      
      // Log summary every 5 minutes
      if (Date.now() % 300000 < interval) {
        this.logSummary();
      }
    }, interval);
  }

  /**
   * Log performance summary
   */
  logSummary() {
    const stats = this.getStats();
    const slowestCommands = this.getSlowestOperations('commands', 5);
    const slowestEvents = this.getSlowestOperations('events', 5);

    log.info('Performance summary', {
      uptime: `${Math.floor(stats.uptime / 1000 / 60)} minutes`,
      memoryUsage: stats.memory.current ? {
        heapUsed: `${(stats.memory.current.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(stats.memory.current.heapTotal / 1024 / 1024).toFixed(2)}MB`
      } : null,
      slowestCommands: slowestCommands.map(cmd => ({
        name: cmd.name,
        avgTime: `${cmd.avgTime.toFixed(2)}ms`,
        count: cmd.count
      })),
      slowestEvents: slowestEvents.map(evt => ({
        name: evt.name,
        avgTime: `${evt.avgTime.toFixed(2)}ms`,
        count: evt.count
      }))
    });
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Start periodic monitoring
performanceMonitor.startPeriodicMonitoring();

export default performanceMonitor; 