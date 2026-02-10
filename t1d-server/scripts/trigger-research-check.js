#!/usr/bin/env node

/**
 * Manually trigger a research monitor check
 */

import { researchMonitor } from '../dist/services/research-monitor.js';

console.log('🔬 Manually triggering research check...\n');

try {
  await researchMonitor.runScheduledCheck();
  console.log('\n✓ Research check completed');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Research check failed:', error);
  process.exit(1);
}
