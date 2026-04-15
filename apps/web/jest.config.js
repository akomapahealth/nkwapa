/** @type {import('jest').Config} */
const config = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testRegex: '\\.(spec|test)\\.(t|j)sx?$',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

module.exports = config;
