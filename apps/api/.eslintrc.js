const path = require('path');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: path.join(__dirname, 'tsconfig.eslint.json'),
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'warn',
  },
};
