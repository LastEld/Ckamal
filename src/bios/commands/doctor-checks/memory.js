/**
 * Memory Availability Check
 * Validates sufficient memory is available
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars

// Memory thresholds
const WARN_HEAP_PERCENT = 85; // Warn if heap usage > 85%
const WARN_RSS_MB = 1024; // Warn if RSS > 1GB

/**
 * Check memory availability
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkMemory(_options = {}) {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
  const heapFreeMB = heapTotalMB - heapUsedMB;
  const heapUsedPercent = heapTotalMB > 0 ? (heapUsedMB / heapTotalMB * 100).toFixed(1) : 0;

  // Get V8 heap statistics if available
  let heapStats = null;
  try {
    const v8 = await import('v8');
    heapStats = v8.getHeapStatistics();
  } catch (err) {
    // V8 module not available
  }

  // Get system memory info
  let systemMemory = null;
  let rssMB = 0;
  if (process.memoryUsage.rss) {
    rssMB = process.memoryUsage.rss() / 1024 / 1024;
    systemMemory = {
      rssMB: rssMB.toFixed(1),
      rssPercent: ((rssMB / (4096)) * 100).toFixed(1) // Assume 4GB typical system
    };
  }

  // Calculate total available memory
  const maxHeapMB = heapStats ? heapStats.heap_size_limit / 1024 / 1024 : 2048; // Default 2GB
  const availableMB = maxHeapMB - heapUsedMB;

  // Check if we have reasonable memory configuration
  if (maxHeapMB < 512) {
    return {
      name: 'Memory Availability',
      status: 'warn',
      message: `Low heap limit: ${maxHeapMB.toFixed(0)}MB`,
      canRepair: false,
      repairHint: 'Increase Node.js memory limit: node --max-old-space-size=1024',
      details: {
        heapUsedMB: heapUsedMB.toFixed(1),
        heapTotalMB: heapTotalMB.toFixed(1),
        maxHeapMB: maxHeapMB.toFixed(1),
        availableMB: availableMB.toFixed(1),
        system: systemMemory
      }
    };
  }

  // Check heap usage percentage
  if (heapUsedPercent > WARN_HEAP_PERCENT) {
    return {
      name: 'Memory Availability',
      status: 'warn',
      message: `High heap usage: ${heapUsedPercent}% (${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB)`,
      canRepair: false,
      repairHint: 'Consider restarting the application or increasing memory limit',
      details: {
        heapUsedMB: heapUsedMB.toFixed(1),
        heapTotalMB: heapTotalMB.toFixed(1),
        heapFreeMB: heapFreeMB.toFixed(1),
        usedPercent: heapUsedPercent,
        maxHeapMB: maxHeapMB.toFixed(1),
        system: systemMemory
      }
    };
  }

  // Check RSS (Resident Set Size) for overall memory pressure
  if (rssMB > WARN_RSS_MB) {
    return {
      name: 'Memory Availability',
      status: 'warn',
      message: `High memory usage (RSS): ${rssMB.toFixed(1)}MB`,
      canRepair: false,
      repairHint: 'High overall memory usage detected',
      details: {
        heapUsedMB: heapUsedMB.toFixed(1),
        heapTotalMB: heapTotalMB.toFixed(1),
        rssMB: rssMB.toFixed(1),
        maxHeapMB: maxHeapMB.toFixed(1),
        system: systemMemory
      }
    };
  }

  // Check external memory (buffers, etc.)
  const externalMB = memUsage.external / 1024 / 1024;
  let externalWarning = null;
  if (externalMB > 500) { // 500MB
    externalWarning = `High external memory: ${externalMB.toFixed(1)}MB`;
  }

  const message = externalWarning
    ? `OK (${heapUsedMB.toFixed(1)}MB heap) - ${externalWarning}`
    : `OK (${heapUsedMB.toFixed(1)}MB heap, ${rssMB.toFixed(1)}MB RSS)`;

  return {
    name: 'Memory Availability',
    status: externalWarning ? 'warn' : 'pass',
    message,
    details: {
      heapUsedMB: heapUsedMB.toFixed(1),
      heapTotalMB: heapTotalMB.toFixed(1),
      heapFreeMB: heapFreeMB.toFixed(1),
      usedPercent: heapUsedPercent,
      externalMB: externalMB.toFixed(1),
      rssMB: rssMB.toFixed(1),
      maxHeapMB: maxHeapMB.toFixed(1),
      system: systemMemory
    }
  };
}

export default checkMemory;
