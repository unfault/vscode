#!/usr/bin/env node

/**
 * Build-time configuration for Unfault extension
 * Logs build type and performs any necessary environment setup
 */

const isProduction = process.env.NODE_ENV === 'production';

console.log(`🔧 ${isProduction ? 'Production' : 'Development'} build completed`);

if (isProduction) {
  console.log('✅ Cloud API endpoint: https://app.unfault.dev/api');
} else {
  console.log('✅ Local development: http://localhost:8080/api/v1');
}

module.exports = {
  isProduction
};