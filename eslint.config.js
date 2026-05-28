const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettier = require('eslint-config-prettier');
const globals = require('globals');
const nextConfig = require('eslint-config-next');

const nextConfigs = nextConfig.map((config) => {
  if (config.ignores) {
    return {
      ...config,
      ignores: config.ignores.map((pattern) =>
        pattern.startsWith('apps/web/') ? pattern : `apps/web/${pattern}`,
      ),
    };
  }

  return {
    ...config,
    files: ['apps/web/**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
  };
});

module.exports = [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/web/public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './apps/api/tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    files: ['**/*.{spec,test}.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.jest,
    },
  },
  ...nextConfigs,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-location-assign-relative-destination': 'off',
    },
  },
  prettier,
];
