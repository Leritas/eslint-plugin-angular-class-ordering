import { ESLint } from 'eslint';
import pkg from '../package.json';
import { RULE_NAME as FORBID_NESTED_RULE_NAME, rule as forbidNestedRule } from './rules/forbid-nested-super-injections';
import { RULE_NAME as MEMBER_ORDERING_RULE_NAME, rule as memberOrderingRule } from './rules/member-ordering';
import { RULE_NAME as PREFER_INJECT_RULE_NAME, rule as preferInjectRule } from './rules/prefer-inject-function';

const pluginRules = {
    [MEMBER_ORDERING_RULE_NAME]: memberOrderingRule,
    [PREFER_INJECT_RULE_NAME]: preferInjectRule,
    [FORBID_NESTED_RULE_NAME]: forbidNestedRule,
} as const;

/**
 * ESLint plugin exposing Angular-aware class member ordering and inject-related rules.
 */
const plugin = {
    meta: {
        name: pkg.name,
        version: pkg.version,
    },
    rules: pluginRules,
    configs: {
        /**
         * Safe default: class member layout only. `prefer-inject-function` and
         * `forbid-nested-super-injections` are opt-in (they can rewrite or steer DI refactors).
         */
        recommended: {
            rules: {
                [`${pkg.name.replace(/^eslint-plugin-/, '')}/${MEMBER_ORDERING_RULE_NAME}`]: 'error',
            },
        },
    },
} as unknown as ESLint.Plugin;

export = plugin;
