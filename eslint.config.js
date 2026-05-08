'use strict';

const globals = require('globals');
const eslintConfigPrettier = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
    {
        ignores: ['node_modules/**', 'coverage/**', 'lib/**'],
    },
    ...tseslint.configs.recommended,
    {
        files: ['eslint.config.js', 'jest.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node,
        },
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['tests/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.jest,
            },
        },
    },
    eslintConfigPrettier,
    {
        files: ['eslint.config.js', 'jest.config.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
);
