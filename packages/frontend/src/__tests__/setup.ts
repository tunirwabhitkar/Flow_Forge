import { config } from '@vue/test-utils';
import ElementPlus from 'element-plus';

// Mount Element Plus globally for component tests
config.global.plugins = [ElementPlus];

// Silence noisy console warnings in tests
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  // Suppress Vue Router warnings in unit tests
  if (typeof args[0] === 'string' && args[0].includes('[Vue Router]')) return;
  originalWarn(...args);
};
