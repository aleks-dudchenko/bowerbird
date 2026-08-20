import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['out/**', 'release/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    // The extension runs in Chrome, not Electron: different globals, and
    // it was excluded from linting entirely until now.
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { chrome: 'readonly', document: 'readonly', fetch: 'readonly', setTimeout: 'readonly' },
    },
  },
  {
    files: ['src/**/*.{js,jsx}', 'scripts/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly',
        process: 'readonly', Buffer: 'readonly', fetch: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', crypto: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        navigator: 'readonly', Headers: 'readonly', Response: 'readonly',
        URL: 'readonly', TextDecoder: 'readonly', Float32Array: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]
