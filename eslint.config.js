'use strict';

const globals = require('globals');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
    {
        ignores: ['node_modules/**', 'coverage/**'],
    },
    {
        files: ['lib/**/*.js'],
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
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
    },
    eslintConfigPrettier,
];
