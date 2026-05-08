'use strict';

const { ESLintUtils } = require('@typescript-eslint/utils');

const RULE_NAME = 'member-ordering';
const ANGULAR_CORE = '@angular/core';

const DEFAULT_DECORATORS = ['Component', 'Directive', 'Injectable', 'Pipe'];
const DEFAULT_ORDER = [
    'signature',

    // --- Dependency Injection ---
    'constructor',
    'inject',

    // --- Public API ---
    'input-signal',
    'input-decorator',
    'output-signal',
    'output-decorator',
    'model-signal',

    // --- Template/DOM ---
    'host-binding-signal',
    'host-binding-decorator',
    'view-query-signal',
    'view-query-decorator',
    'content-query-signal',
    'content-query-decorator',

    // --- Global State ---
    'store-select-signal',
    'store-select-observable',
    'store-select-decorator',

    // --- Reactive Fields ---
    'signal',
    'linkedSignal',
    'computed',

    // --- Ordinary Fields ---
    'public-static-field',
    'protected-static-field',
    'private-static-field',
    'public-instance-field',
    'protected-instance-field',
    'private-instance-field',

    // --- Methods ---
    'public-static-method',
    'protected-static-method',
    'private-static-method',
    'public-instance-method',
    'protected-instance-method',
    'private-instance-method',
];

const messages = {
    wrongOrder:
        'Member "{{member}}" ({{actualCategory}}) must appear before "{{previousMember}}" ({{previousCategory}}). Expected slots: {{expectedOverview}}.',
    unknownCategory: 'Member "{{member}}" does not match any ordering slot; unknownPlacement is "error".',
};

const RANK_MODIFIERS = {
    READONLY_PENALTY: 0.5,
    ACCESSOR_SETTER_OFFSET: 1e-12,
    ORIGINAL_ORDER_TIE: 1e-6,
};

const optionsSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        decorators: {
            type: 'array',
            items: { type: 'string' },
        },
        order: {
            type: 'array',
            items: {
                oneOf: [
                    { type: 'string' },
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            type: { const: 'pattern' },
                            regex: { type: 'string' },
                            flags: { type: 'string' },
                        },
                        required: ['type', 'regex'],
                    },
                ],
            },
        },
        unknownPlacement: {
            enum: ['last', 'ignore', 'error'],
        },
    },
};

const createRule = ESLintUtils.RuleCreator(
    (name) => `https://github.com/Leritas/eslint-plugin-angular-class-ordering/blob/main/docs/rules/${name}.md`,
);

const isCallExpr = (node) => node?.type === 'CallExpression';
const isMemberExpr = (node) => node?.type === 'MemberExpression';
const isIdentifier = (node) => node?.type === 'Identifier';
const isPropertyLike = (node) => ['PropertyDefinition', 'TSAbstractPropertyDefinition'].includes(node?.type);
const isMethod = (node) => ['MethodDefinition', 'TSAbstractMethodDefinition'].includes(node?.type);
const isCtor = (node) => isMethod(node) && node.kind === 'constructor';

const getMemberName = (node) => {
    if (!node?.key) return '(anonymous)';
    return isIdentifier(node.key) ? node.key.name : node.key.value || '(anonymous)';
};

module.exports = {
    rule: createRule({
        name: RULE_NAME,
        meta: {
            type: 'layout',
            docs: {
                description: 'Enforces Angular-aware ordering for fields/methods in Angular decorated classes.',
            },
            fixable: 'code',
            schema: [optionsSchema],
            messages,
        },
        defaultOptions: [
            {
                decorators: DEFAULT_DECORATORS,
                order: DEFAULT_ORDER,
                unknownPlacement: 'last',
            },
        ],
        create(context) {
            const options = context.options[0] || {};
            const decorators = options.decorators ?? DEFAULT_DECORATORS;
            const unknownPlacement = options.unknownPlacement ?? 'last';
            const orderRaw = options.order ?? DEFAULT_ORDER;

            const { slotKeys, patternMatchers } = normalizeOrderEntries(orderRaw);
            const orderIndex = new Map(slotKeys.map((key, i) => [key, i]));
            const sourceCode = context.sourceCode ?? context.getSourceCode();

            return {
                Program(programNode) {
                    const importMap = buildImportMap(programNode);

                    for (const classDecl of iterateClasses(programNode)) {
                        if (!classMatchesDecorators(classDecl, decorators)) continue;

                        visitAngularClass(classDecl, importMap, {
                            context,
                            sourceCode,
                            orderIndex,
                            slotKeys,
                            patternMatchers,
                            unknownPlacement,
                            orderRaw,
                        });
                    }
                },
            };
        },
    }),
    RULE_NAME,
    messages,
};

function normalizeOrderEntries(orderRaw) {
    const slotKeys = [];
    const patternMatchers = [];

    orderRaw.forEach((entry, i) => {
        if (typeof entry === 'string') {
            slotKeys.push(entry);
            patternMatchers.push(null);
        } else if (entry?.type === 'pattern') {
            slotKeys.push(`__pattern_${i}`);
            patternMatchers.push(new RegExp(entry.regex, entry.flags ?? ''));
        }
    });
    return { slotKeys, patternMatchers };
}

function* iterateClasses(programNode) {
    for (const stmt of programNode.body) {
        if (stmt.type === 'ClassDeclaration') yield stmt;
        if (
            ['ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(stmt.type) &&
            stmt.declaration?.type === 'ClassDeclaration'
        ) {
            yield stmt.declaration;
        }
    }
}

function buildImportMap(programNode) {
    const map = new Map();
    programNode.body
        .filter((stmt) => stmt.type === 'ImportDeclaration' && typeof stmt.source?.value === 'string')
        .forEach((stmt) => {
            const moduleName = stmt.source.value;
            (stmt.specifiers || []).forEach((spec) => {
                const importedName =
                    spec.type === 'ImportDefaultSpecifier'
                        ? 'default'
                        : isIdentifier(spec.imported)
                          ? spec.imported.name
                          : spec.imported?.value;
                if (importedName) map.set(spec.local.name, { module: moduleName, importedName });
            });
        });
    return map;
}

function classMatchesDecorators(classNode, decoratorNames) {
    const classDecorators = getDecoratorNames(classNode.decorators);
    return classDecorators.some((n) => decoratorNames.includes(n));
}

function getDecoratorNames(decorators) {
    return (decorators || [])
        .map((d) => {
            const expr = d.expression;
            if (isCallExpr(expr))
                return isIdentifier(expr.callee)
                    ? expr.callee.name
                    : !expr.callee.computed && expr.callee.property?.name;
            return isIdentifier(expr) ? expr.name : null;
        })
        .filter(Boolean);
}

function exprContainsCall(expr, matcher, depth = 16) {
    if (!expr || depth < 0) return false;
    if (isCallExpr(expr) && matcher(expr)) return true;

    if (isCallExpr(expr))
        return (
            exprContainsCall(expr.callee, matcher, depth - 1) ||
            expr.arguments.some((arg) => exprContainsCall(arg, matcher, depth - 1))
        );
    if (isMemberExpr(expr)) return exprContainsCall(expr.object, matcher, depth - 1);
    if (['ArrowFunctionExpression', 'FunctionExpression'].includes(expr.type))
        return exprContainsCall(expr.body, matcher, depth - 1);
    if (expr.type === 'BlockStatement')
        return expr.body.some((st) => exprContainsCall(st.expression || st.argument, matcher, depth - 1));

    return false;
}

function resolveCategory(member, importMap, sourceCode, patternMatchers, slotKeys) {
    const hasDeco = (names) => getDecoratorNames(member.decorators).some((n) => names.includes(n));
    const init = isPropertyLike(member) ? member.value : null;

    if (isMethod(member)) {
        if (member.kind === 'constructor') return 'constructor';
        if (member.abstract || member.type === 'TSAbstractMethodDefinition') return 'signature';
    }

    if (hasDeco(['ViewChild', 'ViewChildren'])) return 'view-query-decorator';
    if (hasDeco(['ContentChild', 'ContentChildren'])) return 'content-query-decorator';
    if (hasDeco(['HostBinding', 'HostListener'])) return 'host-binding-decorator';
    if (hasDeco(['Input'])) return 'input-decorator';
    if (hasDeco(['Output'])) return 'output-decorator';
    if (hasDeco(['Select'])) return 'store-select-decorator';

    const isCoreCall = (node, name) => {
        if (!isCallExpr(node) || !isIdentifier(node.callee)) return false;
        const info = importMap.get(node.callee.name);
        return info?.module === ANGULAR_CORE && (!name || info.importedName === name);
    };

    if (isCallExpr(init)) {
        if (isCoreCall(init, 'inject')) return 'inject';

        if (isCoreCall(init, 'viewChild') || isCoreCall(init, 'viewChildren')) return 'view-query-signal';
        if (isCoreCall(init, 'contentChild') || isCoreCall(init, 'contentChildren')) return 'content-query-signal';
        if (isCoreCall(init, 'hostBinding') || isCoreCall(init, 'hostListener')) return 'host-binding-signal';

        if (isCoreCall(init, 'input')) return 'input-signal';
        if (isCoreCall(init, 'output')) return 'output-signal';
        if (isCoreCall(init, 'model')) return 'model-signal';

        if (isCoreCall(init, 'signal')) return 'signal';
        if (isCoreCall(init, 'linkedSignal')) return 'linkedSignal';
        if (isCoreCall(init, 'computed')) return 'computed';
    }

    const hasCoreCall = (names) => {
        const nameArr = Array.isArray(names) ? names : [names];
        return exprContainsCall(init, (e) => nameArr.some((n) => isCoreCall(e, n)));
    };

    if (hasCoreCall(['viewChild', 'viewChildren'])) return 'view-query-signal';
    if (hasCoreCall(['contentChild', 'contentChildren'])) return 'content-query-signal';
    if (hasCoreCall(['hostBinding', 'hostListener'])) return 'host-binding-signal';

    if (hasCoreCall('input')) return 'input-signal';
    if (hasCoreCall('output')) return 'output-signal';
    if (hasCoreCall('model')) return 'model-signal';

    if (exprContainsCall(init, (e) => isMemberExpr(e.callee) && e.callee.property?.name === 'selectSignal'))
        return 'store-select-signal';
    if (exprContainsCall(init, (e) => isMemberExpr(e.callee) && e.callee.property?.name === 'select'))
        return 'store-select-observable';

    if (hasCoreCall('signal')) return 'signal';
    if (hasCoreCall('linkedSignal')) return 'linkedSignal';
    if (hasCoreCall('computed')) return 'computed';

    const acc = member.accessibility ?? 'public';
    const type = isMethod(member) ? 'method' : 'field';
    const builtin = `${acc}-${member.static ? 'static' : 'instance'}-${type}`;
    if (slotKeys.includes(builtin)) return builtin;

    const text = sourceCode.getText(member);
    const patternIdx = patternMatchers.findIndex((rx) => rx?.test(text));
    return patternIdx !== -1 ? slotKeys[patternIdx] : null;
}

function alignAccessorPairs(members, categories, orderIndex) {
    const pairs = new Map();
    members.forEach((m, i) => {
        if (isMethod(m) && ['get', 'set'].includes(m.kind)) {
            const key = getMemberName(m);
            if (!pairs.has(key)) pairs.set(key, { get: -1, set: -1 });
            pairs.get(key)[m.kind] = i;
        }
    });

    for (const { get, set } of pairs.values()) {
        if (get !== -1 && set !== -1) {
            const catGet = categories[get];
            const catSet = categories[set];
            const rGet = orderIndex.get(catGet) ?? Infinity;
            const rSet = orderIndex.get(catSet) ?? Infinity;
            const merged = rGet <= rSet ? catGet : catSet;
            categories[get] = merged;
            categories[set] = merged;
        }
    }
    return pairs;
}

function calculateRanks(members, categories, orderIndex, unknownPlacement, slotKeysLength) {
    const pairs = alignAccessorPairs(members, categories, orderIndex);

    const ranks = members.map(() => null);
    const skipFlags = members.map(() => false);
    const unknownErrors = [];

    members.forEach((m, i) => {
        const category = categories[i];
        const idx = orderIndex.get(category);
        const readonlyPenalty = isPropertyLike(m) && m.readonly ? RANK_MODIFIERS.READONLY_PENALTY : 0;
        const tieBreaker = i * RANK_MODIFIERS.ORIGINAL_ORDER_TIE;

        if (idx === undefined) {
            if (unknownPlacement === 'ignore') skipFlags[i] = true;
            else if (unknownPlacement === 'error') unknownErrors.push(i);
            else ranks[i] = slotKeysLength + readonlyPenalty + tieBreaker;
        } else {
            ranks[i] = idx + readonlyPenalty + tieBreaker;
        }
    });

    for (const { get, set } of pairs.values()) {
        if (get !== -1 && set !== -1 && ranks[get] != null) {
            ranks[set] = ranks[get] + RANK_MODIFIERS.ACCESSOR_SETTER_OFFSET;
        }
    }

    return { ranks, skipFlags, unknownErrors };
}

function visitAngularClass(classNode, importMap, ctx) {
    const { context, sourceCode, orderIndex, slotKeys, patternMatchers, unknownPlacement, orderRaw } = ctx;
    const members = classNode.body.body.filter((n) => isPropertyLike(n) || isMethod(n));

    const categories = members.map((m) => resolveCategory(m, importMap, sourceCode, patternMatchers, slotKeys));
    const { ranks, skipFlags, unknownErrors } = calculateRanks(
        members,
        categories,
        orderIndex,
        unknownPlacement,
        slotKeys.length,
    );

    unknownErrors.forEach((idx) =>
        context.report({
            node: members[idx],
            messageId: 'unknownCategory',
            data: { member: getMemberName(members[idx]) },
        }),
    );

    const tracked = members.map((m, i) => ({ m, i, rank: ranks[i] })).filter((x) => !skipFlags[x.i] && x.rank != null);
    const sorted = [...tracked].sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.i - b.i));

    const violationIdx = tracked.findIndex((item, idx) => item.i !== sorted[idx].i);

    if (violationIdx !== -1) {
        const wrongNode = tracked[violationIdx];
        const previousNode = sorted[violationIdx - 1] || sorted[0];

        const report = {
            node: wrongNode.m,
            messageId: 'wrongOrder',
            data: {
                member: getMemberName(wrongNode.m),
                actualCategory: categories[wrongNode.i] || 'unknown',
                previousMember: getMemberName(previousNode.m),
                previousCategory: categories[previousNode.i] || 'unknown',
                expectedOverview: orderRaw.map((e) => (typeof e === 'string' ? e : `pattern:${e.regex}`)).join(', '),
            },
        };

        if (unknownErrors.length === 0 && unknownPlacement !== 'error') {
            report.fix = (fixer) => FixerEngine.run(fixer, sourceCode, classNode.body, members, ranks, categories);
        }
        context.report(report);
    }
}

const FixerEngine = {
    run(fixer, sourceCode, classBody, members, ranks, categories) {
        const innerStart =
            sourceCode.getFirstToken(classBody, (t) => t.value === '{')?.range[1] ?? classBody.range[0] + 1;
        const innerEnd = classBody.range[1] - 1;

        const ranges = members.map((member, i) => {
            const next = members[i + 1];
            const commentsBefore = sourceCode.getCommentsBefore(member);
            let start = commentsBefore.length > 0 ? commentsBefore[0].range[0] : member.range[0];

            while (start > innerStart && sourceCode.text[start - 1] !== '\n') start--;

            const cap = next ? (sourceCode.getCommentsBefore(next)[0]?.range[0] ?? next.range[0]) : innerEnd;
            let end = member.range[1];

            for (const c of sourceCode.getCommentsAfter(member)) {
                if (c.range[0] >= cap) break;
                end = Math.max(end, c.range[1]);
            }
            return [start, Math.min(end, cap)];
        });

        const ordered = members
            .map((member, i) => ({
                member,
                i,
                rank: ranks[i],
                category: categories[i],
            }))
            .sort((a, b) => {
                if (a.rank != null && b.rank != null) return a.rank !== b.rank ? a.rank - b.rank : a.i - b.i;
                if (a.rank == null && b.rank == null) {
                    const rA = isPropertyLike(a.member) && a.member.readonly;
                    const rB = isPropertyLike(b.member) && b.member.readonly;
                    return rA !== rB ? (rA ? 1 : -1) : a.i - b.i;
                }
                return a.rank != null ? -1 : 1;
            })
            .map((row) => ({
                ...row,
                raw: sourceCode.text.slice(ranges[row.i][0], ranges[row.i][1]),
            }));

        let newText = '';
        ordered.forEach((chunk, k) => {
            if (k > 0) newText += this.calculateGap(ordered[k - 1], chunk, sourceCode);
            newText += chunk.raw;
        });

        const trailingGap = sourceCode.text.slice(innerStart, innerEnd).match(/(\n(?:[ \t]*\n)*[ \t]*)$/)?.[1] ?? '\n';
        const finalReplacement = newText.trimEnd() ? `\n${newText.trimEnd()}${trailingGap}` : trailingGap;

        return fixer.replaceTextRange([innerStart, innerEnd], finalReplacement);
    },

    calculateGap(prev, curr, sourceCode) {
        const isMethodNonCtor = (m) => isMethod(m) && m.kind !== 'constructor';

        if (
            isMethod(prev.member) &&
            isMethod(curr.member) &&
            ['get', 'set'].includes(prev.member.kind) &&
            ['get', 'set'].includes(curr.member.kind) &&
            getMemberName(prev.member) === getMemberName(curr.member)
        ) {
            return '\n';
        }

        const hasComments = sourceCode.getCommentsBefore(curr.member).length > 0;
        if (isCtor(prev.member) && !isCtor(curr.member)) return '\n\n';
        if (isMethodNonCtor(prev.member) || isMethodNonCtor(curr.member)) return '\n\n';
        if (hasComments) return '\n\n';
        if (prev.category !== curr.category) return '\n\n';

        const prRo = isPropertyLike(prev.member) && prev.member.readonly;
        const crRo = isPropertyLike(curr.member) && curr.member.readonly;
        return !prRo && crRo ? '\n\n' : '\n';
    },
};
