'use strict';

/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    preset: 'ts-jest',
    testMatch: ['**/tests/**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.test.json',
            },
        ],
    },
};
