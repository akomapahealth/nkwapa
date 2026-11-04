/** @type {import('jest').Config} */
const config = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testRegex: '\\.(spec|test)\\.(t|j)sx?$',
  transform: {
    // tsconfig keeps JSX for Next; component tests need it compiled.
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

module.exports = config;
