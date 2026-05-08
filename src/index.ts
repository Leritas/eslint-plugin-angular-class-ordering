import { ESLint } from 'eslint';
import pkg from '../package.json';
import { RULE_NAME, rule } from './rules/member-ordering';

/**
 * ESLint plugin exposing Angular-aware class member ordering.
 */
const plugin = {
    meta: {
        name: pkg.name,
        version: pkg.version,
    },
    rules: {
        [RULE_NAME]: rule,
    },
} as unknown as ESLint.Plugin;

export = plugin;
