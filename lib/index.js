"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const package_json_1 = __importDefault(require("../package.json"));
const member_ordering_1 = require("./rules/member-ordering");
/**
 * ESLint plugin exposing Angular-aware class member ordering.
 */
const plugin = {
    meta: {
        name: package_json_1.default.name,
        version: package_json_1.default.version,
    },
    rules: {
        [member_ordering_1.RULE_NAME]: member_ordering_1.rule,
    },
};
module.exports = plugin;
//# sourceMappingURL=index.js.map