const base = require('./visual-accessibility.config.cjs');
// Keep the R8.6/R8.7 combined coverage, including the carried nine non-baseline failures.
// Explicitly compare the 50 committed images. Never create or replace baselines in release QA.
module.exports = {
  ...base,
  updateSnapshots: 'none',
  reporter: [['list'], ['json', { outputFile: `${process.env.EVIDENCE_DIR}/report.json` }]],
};
