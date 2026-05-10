"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const package_json_1 = __importDefault(require("../package.json"));
const forbid_nested_super_injections_1 = require("./rules/forbid-nested-super-injections");
const member_ordering_1 = require("./rules/member-ordering");
const prefer_inject_function_1 = require("./rules/prefer-inject-function");
const pluginRules = {
    [member_ordering_1.RULE_NAME]: member_ordering_1.rule,
    [prefer_inject_function_1.RULE_NAME]: prefer_inject_function_1.rule,
    [forbid_nested_super_injections_1.RULE_NAME]: forbid_nested_super_injections_1.rule,
};
/**
 * ESLint plugin exposing Angular-aware class member ordering and inject-related rules.
 */
const plugin = {
    meta: {
        name: package_json_1.default.name,
        version: package_json_1.default.version,
    },
    rules: pluginRules,
    configs: {
        /**
         * Safe default: class member layout only. `prefer-inject-function` and
         * `forbid-nested-super-injections` are opt-in (they can rewrite or steer DI refactors).
         */
        recommended: {
            rules: {
                [`${package_json_1.default.name.replace(/^eslint-plugin-/, '')}/${member_ordering_1.RULE_NAME}`]: 'error',
            },
        },
    },
};
module.exports = plugin;
//# sourceMappingURL=index.js.map