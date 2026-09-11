/**
 * Public configuration for the browser: regions, states, defaults.
 * Contains no secrets — only whether a key is configured, never the key.
 */

const { REGIONS, STATES, DEFAULT_CONFIG } = require('../runtime');
const { hasKey } = require('../calle');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ready: hasKey(),
    keyConfigured: hasKey(),
    build: 'ui-v2',
    regions: REGIONS,
    states: STATES,
    defaults: {
      task: DEFAULT_CONFIG.task,
      recipientResultSchema: DEFAULT_CONFIG.recipientResultSchema,
      reviewBelowConfidence: DEFAULT_CONFIG.reviewBelowConfidence,
      reviewOutcomes: DEFAULT_CONFIG.reviewOutcomes,
      maxCallsPerRun: DEFAULT_CONFIG.maxCallsPerRun,
      maxAttempts: DEFAULT_CONFIG.maxAttempts
    }
  });
};
