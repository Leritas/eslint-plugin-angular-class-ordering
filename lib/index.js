'use strict';

const memberOrdering = require('./rules/member-ordering');
const pkg = require('../package.json');

module.exports = {
    meta: {
        name: pkg.name,
        version: pkg.version,
    },
    rules: {
        [memberOrdering.RULE_NAME]: memberOrdering.rule,
    },
};
