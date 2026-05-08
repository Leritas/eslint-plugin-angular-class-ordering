"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rule = exports.messages = exports.DEFAULT_ORDER = exports.DEFAULT_DECORATORS = exports.RULE_NAME = void 0;
const utils_1 = require("@typescript-eslint/utils");
exports.RULE_NAME = 'member-ordering';
const ANGULAR_CORE = '@angular/core';
exports.DEFAULT_DECORATORS = ['Component', 'Directive', 'Injectable', 'Pipe'];
/** Built-in ordering slot keys matching Angular/class member shapes. */
exports.DEFAULT_ORDER = [
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
    'host-listener-signal',
    'host-listener-decorator',
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
    // --- Accessors & abstract declarations ---
    'getter-setter',
    'abstract',
    // --- Methods ---
    'public-static-method',
    'protected-static-method',
    'private-static-method',
    'public-instance-method',
    'protected-instance-method',
    'private-instance-method',
];
exports.messages = {
    wrongOrder: 'Member "{{member}}" ({{actualCategoryLabel}}) must appear before "{{previousMember}}" ({{previousCategoryLabel}}). Near expected groups: {{expectedOverview}}.',
    unknownCategory: 'Member "{{member}}" does not match any ordering slot; unknownPlacement is "error".',
};
const REGEX_ORDER_PREFIX = 'regex:';
const CUSTOM_FUNC_PREFIX = 'custom-func-';
const CUSTOM_DEC_PREFIX = 'custom-dec-';
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
                            type: { type: 'string', enum: ['pattern'] },
                            regex: { type: 'string' },
                            flags: { type: 'string' },
                        },
                        required: ['type', 'regex'],
                    },
                ],
            },
        },
        unknownPlacement: {
            type: 'string',
            enum: ['last', 'ignore', 'error'],
        },
    },
};
const createRule = utils_1.ESLintUtils.RuleCreator((name) => `https://github.com/Leritas/eslint-plugin-angular-class-ordering/blob/main/docs/rules/${name}.md`);
function isCallExpr(node) {
    return node?.type === 'CallExpression';
}
function isMemberExpr(node) {
    return node?.type === 'MemberExpression';
}
function isIdentifier(node) {
    return node?.type === 'Identifier';
}
function isPropertyLike(node) {
    return node.type === 'PropertyDefinition' || node.type === 'TSAbstractPropertyDefinition';
}
function isLintedMember(n) {
    return (n.type === 'PropertyDefinition' ||
        n.type === 'TSAbstractPropertyDefinition' ||
        n.type === 'MethodDefinition' ||
        n.type === 'TSAbstractMethodDefinition');
}
function isMethod(node) {
    return node.type === 'MethodDefinition' || node.type === 'TSAbstractMethodDefinition';
}
function isCtor(node) {
    return isMethod(node) && node.kind === 'constructor';
}
function getMemberName(node) {
    if (!node.key)
        return '(anonymous)';
    if (isIdentifier(node.key))
        return node.key.name;
    if ('value' in node.key && typeof node.key.value === 'string')
        return node.key.value;
    return '(anonymous)';
}
/** Whole-string matchers. */
const CUSTOM_FUNC_ORDER_RE = /^custom-func-([\w$]+)$/;
const CUSTOM_DEC_ORDER_RE = /^custom-dec-([\w$]+)$/;
function overlayCustomDecoratorProbe(decoratorName) {
    return (member) => getDecoratorNames(member.decorators).some((n) => n === decoratorName);
}
function overlayRegexProbe(rx) {
    return (_m, _sc, text) => rx.test(text ?? '');
}
/** Root expression scanned for nested custom-function calls (init or method value). */
function getMemberScratchRoot(member) {
    if (isPropertyLike(member))
        return member.value;
    if (isMethod(member))
        return member.value;
    return null;
}
function calleeMatchesCustomName(call, name) {
    if (isIdentifier(call.callee) && call.callee.name === name)
        return true;
    return (isMemberExpr(call.callee) &&
        !call.callee.computed &&
        isIdentifier(call.callee.property) &&
        call.callee.property.name === name);
}
function probeCustomFunc(member, name) {
    const root = getMemberScratchRoot(member);
    if (!root)
        return false;
    return exprContainsCall(root, (e) => calleeMatchesCustomName(e, name));
}
function formatOrderSlotLabel(orderRaw, index) {
    const entry = orderRaw[index];
    if (typeof entry === 'string') {
        if (entry.startsWith(REGEX_ORDER_PREFIX))
            return `regex:${escapeRegExpSnippet(entry.slice(REGEX_ORDER_PREFIX.length))}`;
        if (entry.startsWith(CUSTOM_FUNC_PREFIX))
            return entry;
        if (entry.startsWith(CUSTOM_DEC_PREFIX))
            return entry;
        return entry;
    }
    const flagsPart = entry.flags ? ` (${entry.flags})` : '';
    return `pattern:${escapeRegExpSnippet(entry.regex)}${flagsPart}`;
}
/** Short preview for error messages — avoid dumping huge regex bodies. */
function escapeRegExpSnippet(s, maxLen = 48) {
    const oneLine = s.replace(/\s+/g, ' ');
    return oneLine.length <= maxLen ? oneLine : `${oneLine.slice(0, maxLen)}…`;
}
function buildNearbySlotOverview(orderRaw, orderIndexBySlotKey, categoryA, categoryB) {
    const idxA = categoryA !== null && categoryA !== undefined ? orderIndexBySlotKey.get(categoryA) : undefined;
    const idxB = categoryB !== null && categoryB !== undefined ? orderIndexBySlotKey.get(categoryB) : undefined;
    let lo = 0;
    let hi = orderRaw.length - 1;
    if (idxA !== undefined || idxB !== undefined) {
        const baseLo = idxA ?? idxB ?? 0;
        const baseHi = idxB ?? idxA ?? 0;
        lo = Math.max(0, Math.min(baseLo, baseHi) - 2);
        hi = Math.min(orderRaw.length - 1, Math.max(baseLo, baseHi) + 2);
    }
    const slice = [];
    for (let j = lo; j <= hi; j++)
        slice.push(formatOrderSlotLabel(orderRaw, j));
    return slice.join(' → ');
}
/**
 * Validates `regex:` shorthand: body is everything after first `regex:` prefix; `:`
 * characters in the regex body itself are not supported (use `{ type:'pattern', regex }`).
 */
function normalizeOrderEntries(orderRaw) {
    const slotKeys = [];
    const overlayProbes = [];
    const slotLabels = [];
    orderRaw.forEach((entry, i) => {
        const label = formatOrderSlotLabel(orderRaw, i);
        const pushSyntheticOverlay = (matcher, innerLabel) => {
            const key = `__overlay_${i}`;
            overlayProbes.push(matcher ?? null);
            slotKeys.push(key);
            slotLabels.push(innerLabel);
            return key;
        };
        const pushBuiltin = (key) => {
            overlayProbes.push(null);
            slotKeys.push(key);
            slotLabels.push(label);
        };
        if (typeof entry === 'string') {
            if (entry.startsWith(REGEX_ORDER_PREFIX)) {
                const regexBody = entry.slice(REGEX_ORDER_PREFIX.length);
                if (!regexBody)
                    throw new Error(`member-ordering: empty "${REGEX_ORDER_PREFIX}" order entry at index ${i}`);
                let rx;
                try {
                    rx = new RegExp(regexBody, '');
                }
                catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    throw new Error(`member-ordering: invalid "${REGEX_ORDER_PREFIX}" regexp at index ${i}: ${msg}`);
                }
                pushSyntheticOverlay(overlayRegexProbe(rx), label);
                return;
            }
            const decMatch = CUSTOM_DEC_ORDER_RE.exec(entry);
            if (decMatch) {
                pushSyntheticOverlay(overlayCustomDecoratorProbe(decMatch[1]), label);
                return;
            }
            const funcMatch = CUSTOM_FUNC_ORDER_RE.exec(entry);
            if (funcMatch) {
                pushSyntheticOverlay((m) => probeCustomFunc(m, funcMatch[1]), label);
                return;
            }
            pushBuiltin(entry);
            return;
        }
        if (entry?.type === 'pattern') {
            let rx;
            try {
                rx = new RegExp(entry.regex, entry.flags ?? '');
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`member-ordering: invalid pattern object at index ${i}: ${msg}`);
            }
            pushSyntheticOverlay(overlayRegexProbe(rx), label);
            return;
        }
        throw new Error(`member-ordering: unsupported order entry at index ${i}`);
    });
    return { slotKeys, overlayProbes, slotLabels };
}
/**
 * Yields every top-level class declaration, including exported classes.
 */
function* iterateClasses(programNode) {
    for (const stmt of programNode.body) {
        if (stmt.type === 'ClassDeclaration')
            yield stmt;
        if ((stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') &&
            stmt.declaration?.type === 'ClassDeclaration') {
            yield stmt.declaration;
        }
    }
}
/**
 * Maps local identifier names to their resolved module + imported symbol name.
 */
function buildImportMap(programNode) {
    const map = new Map();
    for (const stmt of programNode.body) {
        if (stmt.type !== 'ImportDeclaration' || typeof stmt.source.value !== 'string')
            continue;
        const moduleName = stmt.source.value;
        for (const spec of stmt.specifiers ?? []) {
            let importedName;
            if (spec.type === 'ImportDefaultSpecifier')
                importedName = 'default';
            else if (spec.type === 'ImportSpecifier') {
                const imp = spec.imported;
                importedName =
                    imp.type === 'Identifier'
                        ? imp.name
                        : imp.type === 'Literal' && typeof imp.value === 'string'
                            ? imp.value
                            : undefined;
            }
            if (importedName)
                map.set(spec.local.name, { module: moduleName, importedName });
        }
    }
    return map;
}
function classMatchesDecorators(classNode, decoratorNames) {
    const classDecorators = getDecoratorNames(classNode.decorators);
    return classDecorators.some((n) => decoratorNames.includes(n));
}
/**
 * Reads decorator call / identifier names applied to a class or member.
 */
function getDecoratorNames(decorators) {
    return (decorators ?? [])
        .map((d) => {
        const expr = d.expression;
        if (isCallExpr(expr)) {
            if (isIdentifier(expr.callee))
                return expr.callee.name;
            if (isMemberExpr(expr.callee) && !expr.callee.computed && expr.callee.property.type === 'Identifier') {
                return expr.callee.property.name;
            }
            return undefined;
        }
        return isIdentifier(expr) ? expr.name : undefined;
    })
        .filter((n) => Boolean(n));
}
/**
 * Depth-first search for a nested call matching `matcher`, stopping after `depth` steps.
 * @remarks Used to classify signal/query wrappers and chained `.selectSignal()` patterns.
 */
function exprContainsCall(expr, matcher, depth = 16) {
    if (!expr || depth < 0)
        return false;
    if (isCallExpr(expr) && matcher(expr))
        return true;
    if (isCallExpr(expr)) {
        return (exprContainsCall(expr.callee, matcher, depth - 1) ||
            expr.arguments.some((arg) => exprContainsCall(arg, matcher, depth - 1)));
    }
    if (isMemberExpr(expr))
        return exprContainsCall(expr.object, matcher, depth - 1);
    if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') {
        return exprContainsCall(expr.body, matcher, depth - 1);
    }
    if (expr.type === 'BlockStatement') {
        return expr.body.some((st) => {
            const loose = st;
            return exprContainsCall(loose.expression ?? loose.argument ?? undefined, matcher, depth - 1);
        });
    }
    return false;
}
/**
 * Assigns a canonical ordering slot key to a class member, or `null` when no slot matches.
 */
function resolveCategory(member, importMap, sourceCode, overlayProbes, slotKeys) {
    const hasDeco = (names) => getDecoratorNames(member.decorators).some((n) => names.includes(n));
    const init = isPropertyLike(member) ? member.value : null;
    if (isMethod(member)) {
        if (member.kind === 'constructor')
            return 'constructor';
        if ('abstract' in member && member.abstract)
            return 'abstract';
        if (member.type === 'TSAbstractMethodDefinition')
            return 'abstract';
        if (member.kind === 'get' || member.kind === 'set')
            return 'getter-setter';
    }
    if (hasDeco(['ViewChild', 'ViewChildren']))
        return 'view-query-decorator';
    if (hasDeco(['ContentChild', 'ContentChildren']))
        return 'content-query-decorator';
    if (hasDeco(['HostBinding']))
        return 'host-binding-decorator';
    if (hasDeco(['HostListener']))
        return 'host-listener-decorator';
    if (hasDeco(['Input']))
        return 'input-decorator';
    if (hasDeco(['Output']))
        return 'output-decorator';
    if (hasDeco(['Select']))
        return 'store-select-decorator';
    const isCoreCall = (node, name) => {
        if (!isIdentifier(node.callee))
            return false;
        const info = importMap.get(node.callee.name);
        return info?.module === ANGULAR_CORE && (!name || info.importedName === name);
    };
    if (isCallExpr(init)) {
        if (isCoreCall(init, 'inject'))
            return 'inject';
        if (isCoreCall(init, 'viewChild') || isCoreCall(init, 'viewChildren'))
            return 'view-query-signal';
        if (isCoreCall(init, 'contentChild') || isCoreCall(init, 'contentChildren'))
            return 'content-query-signal';
        if (isCoreCall(init, 'hostBinding'))
            return 'host-binding-signal';
        if (isCoreCall(init, 'hostListener'))
            return 'host-listener-signal';
        if (isCoreCall(init, 'input'))
            return 'input-signal';
        if (isCoreCall(init, 'output'))
            return 'output-signal';
        if (isCoreCall(init, 'model'))
            return 'model-signal';
        if (isCoreCall(init, 'signal'))
            return 'signal';
        if (isCoreCall(init, 'linkedSignal'))
            return 'linkedSignal';
        if (isCoreCall(init, 'computed'))
            return 'computed';
    }
    const hasCoreCall = (names) => {
        const nameArr = Array.isArray(names) ? names : [names];
        return exprContainsCall(init, (e) => nameArr.some((n) => isCoreCall(e, n)));
    };
    if (hasCoreCall(['viewChild', 'viewChildren']))
        return 'view-query-signal';
    if (hasCoreCall(['contentChild', 'contentChildren']))
        return 'content-query-signal';
    if (hasCoreCall('hostBinding'))
        return 'host-binding-signal';
    if (hasCoreCall('hostListener'))
        return 'host-listener-signal';
    if (hasCoreCall('input'))
        return 'input-signal';
    if (hasCoreCall('output'))
        return 'output-signal';
    if (hasCoreCall('model'))
        return 'model-signal';
    if (exprContainsCall(init, (e) => {
        return (isMemberExpr(e.callee) &&
            !e.callee.computed &&
            e.callee.property.type === 'Identifier' &&
            e.callee.property.name === 'selectSignal');
    })) {
        return 'store-select-signal';
    }
    if (exprContainsCall(init, (e) => {
        return (isMemberExpr(e.callee) &&
            !e.callee.computed &&
            e.callee.property.type === 'Identifier' &&
            e.callee.property.name === 'select');
    })) {
        return 'store-select-observable';
    }
    if (hasCoreCall('signal'))
        return 'signal';
    if (hasCoreCall('linkedSignal'))
        return 'linkedSignal';
    if (hasCoreCall('computed'))
        return 'computed';
    const acc = member.accessibility ?? 'public';
    const type = isMethod(member) ? 'method' : 'field';
    const builtin = `${acc}-${member.static ? 'static' : 'instance'}-${type}`;
    const text = sourceCode.getText(member);
    let bestOverlayIdx = -1;
    for (let idx = 0; idx < overlayProbes.length; idx++) {
        const probe = overlayProbes[idx];
        if (!probe || !probe(member, sourceCode, text))
            continue;
        if (bestOverlayIdx === -1 || idx < bestOverlayIdx)
            bestOverlayIdx = idx;
    }
    if (bestOverlayIdx !== -1)
        return slotKeys[bestOverlayIdx] ?? null;
    if (slotKeys.includes(builtin))
        return builtin;
    return null;
}
/**
 * Forces getters/setters for the same property name to share one slot category for stable pairing.
 */
function alignAccessorPairs(members, categories, orderIndex) {
    const pairs = new Map();
    members.forEach((m, i) => {
        if (isMethod(m) && (m.kind === 'get' || m.kind === 'set')) {
            const key = getMemberName(m);
            if (!pairs.has(key))
                pairs.set(key, { get: -1, set: -1 });
            const entry = pairs.get(key);
            if (entry) {
                if (m.kind === 'get')
                    entry.get = i;
                else if (m.kind === 'set')
                    entry.set = i;
            }
        }
    });
    for (const { get, set } of pairs.values()) {
        if (get !== -1 && set !== -1) {
            const catGet = categories[get];
            const catSet = categories[set];
            const rGet = (catGet !== null && catGet !== undefined ? orderIndex.get(catGet) : undefined) ?? Infinity;
            const rSet = (catSet !== null && catSet !== undefined ? orderIndex.get(catSet) : undefined) ?? Infinity;
            const merged = rGet <= rSet ? catGet : catSet;
            categories[get] = merged ?? null;
            categories[set] = merged ?? null;
        }
    }
    return pairs;
}
/**
 * Computes fractional ranks from slot indices, unknown-placement policy, and accessor pairing rules.
 */
function calculateRanks(members, categories, orderIndex, unknownPlacement, slotKeysLength) {
    const pairs = alignAccessorPairs(members, categories, orderIndex);
    const ranks = members.map(() => null);
    const skipFlags = members.map(() => false);
    const unknownErrors = [];
    members.forEach((m, i) => {
        const category = categories[i];
        const idx = category !== null && category !== undefined ? orderIndex.get(category) : undefined;
        const readonlyPenalty = isPropertyLike(m) && 'readonly' in m && m.readonly ? RANK_MODIFIERS.READONLY_PENALTY : 0;
        const tieBreaker = i * RANK_MODIFIERS.ORIGINAL_ORDER_TIE;
        if (idx === undefined) {
            if (unknownPlacement === 'ignore')
                skipFlags[i] = true;
            else if (unknownPlacement === 'error')
                unknownErrors.push(i);
            else
                ranks[i] = slotKeysLength + readonlyPenalty + tieBreaker;
        }
        else {
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
function slotLabelFromCategory(slotLabels, orderIndex, category) {
    if (category === null || category === undefined)
        return 'unknown';
    const idx = orderIndex.get(category);
    if (idx !== undefined && slotLabels[idx] !== undefined)
        return slotLabels[idx];
    return category;
}
function visitAngularClass(classNode, importMap, ctx) {
    const { context, sourceCode, orderIndex, slotKeys, overlayProbes, slotLabels, unknownPlacement, orderRaw } = ctx;
    const members = classNode.body.body.filter(isLintedMember);
    const categories = members.map((m) => resolveCategory(m, importMap, sourceCode, overlayProbes, slotKeys));
    const { ranks, skipFlags, unknownErrors } = calculateRanks(members, categories, orderIndex, unknownPlacement, slotKeys.length);
    unknownErrors.forEach((idx) => context.report({
        node: members[idx],
        messageId: 'unknownCategory',
        data: { member: getMemberName(members[idx]) },
    }));
    const tracked = members
        .map((m, i) => ({ m, i, rank: ranks[i] }))
        .filter((x) => !skipFlags[x.i] && x.rank != null);
    const sorted = [...tracked].sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.i - b.i));
    const violationIdx = tracked.findIndex((item, idx) => item.i !== sorted[idx].i);
    if (violationIdx !== -1) {
        const wrongNode = tracked[violationIdx];
        const previousNode = sorted[violationIdx - 1] ?? sorted[0];
        const baseReport = {
            node: wrongNode.m,
            messageId: 'wrongOrder',
            data: {
                member: getMemberName(wrongNode.m),
                actualCategoryLabel: slotLabelFromCategory(slotLabels, orderIndex, categories[wrongNode.i]),
                previousMember: getMemberName(previousNode.m),
                previousCategoryLabel: slotLabelFromCategory(slotLabels, orderIndex, categories[previousNode.i]),
                expectedOverview: buildNearbySlotOverview(orderRaw, orderIndex, categories[wrongNode.i], categories[previousNode.i]),
            },
        };
        if (unknownErrors.length === 0 && unknownPlacement !== 'error') {
            context.report({
                ...baseReport,
                fix: (fixer) => FixerEngine.run(fixer, sourceCode, classNode.body, members, ranks, categories),
            });
        }
        else {
            context.report(baseReport);
        }
    }
}
const FixerEngine = {
    /**
     * Replaces class body interior text with members sorted by ascending rank while preserving captured trivia slices.
     */
    run(fixer, sourceCode, classBody, members, ranks, categories) {
        const braceOpen = sourceCode.getFirstToken(classBody, (t) => t.value === '{');
        const innerStart = braceOpen?.range[1] ?? classBody.range[0] + 1;
        const innerEnd = classBody.range[1] - 1;
        const ranges = members.map((member, i) => {
            const next = members[i + 1];
            const commentsBefore = sourceCode.getCommentsBefore(member);
            let start = commentsBefore.length > 0 ? commentsBefore[0].range[0] : member.range[0];
            while (start > innerStart && sourceCode.text[start - 1] !== '\n')
                start--;
            const cap = next ? (sourceCode.getCommentsBefore(next)[0]?.range[0] ?? next.range[0]) : innerEnd;
            let end = member.range[1];
            for (const c of sourceCode.getCommentsAfter(member)) {
                const cStart = c.range?.[0];
                const cEnd = c.range?.[1];
                if (cStart === undefined || cEnd === undefined)
                    continue;
                if (cStart >= cap)
                    break;
                end = Math.max(end, cEnd);
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
            if (a.rank != null && b.rank != null)
                return a.rank !== b.rank ? a.rank - b.rank : a.i - b.i;
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
            if (k > 0)
                newText += FixerEngine.calculateGap(ordered[k - 1], chunk, sourceCode);
            newText += chunk.raw;
        });
        const trailingGap = sourceCode.text.slice(innerStart, innerEnd).match(/(\n(?:[ \t]*\n)*[ \t]*)$/)?.[1] ?? '\n';
        const finalReplacement = newText.trimEnd() ? `\n${newText.trimEnd()}${trailingGap}` : trailingGap;
        return fixer.replaceTextRange([innerStart, innerEnd], finalReplacement);
    },
    /**
     * Chooses blank-line spacing between two consecutive chunks based on member kinds and categories.
     */
    calculateGap(prev, curr, sourceCode) {
        const isMethodNonCtor = (m) => isMethod(m) && m.kind !== 'constructor';
        if (isMethod(prev.member) &&
            isMethod(curr.member) &&
            (prev.member.kind === 'get' || prev.member.kind === 'set') &&
            (curr.member.kind === 'get' || curr.member.kind === 'set') &&
            getMemberName(prev.member) === getMemberName(curr.member)) {
            return '\n';
        }
        const hasComments = sourceCode.getCommentsBefore(curr.member).length > 0;
        if (isCtor(prev.member) && !isCtor(curr.member))
            return '\n\n';
        if (isMethodNonCtor(prev.member) || isMethodNonCtor(curr.member))
            return '\n\n';
        if (hasComments)
            return '\n\n';
        if (prev.category !== curr.category)
            return '\n\n';
        const prRo = isPropertyLike(prev.member) && prev.member.readonly;
        const crRo = isPropertyLike(curr.member) && curr.member.readonly;
        return !prRo && crRo ? '\n\n' : '\n';
    },
};
exports.rule = createRule({
    name: exports.RULE_NAME,
    meta: {
        type: 'layout',
        docs: {
            description: 'Enforces Angular-aware ordering for fields/methods in Angular decorated classes.',
        },
        fixable: 'code',
        schema: [optionsSchema],
        messages: exports.messages,
    },
    defaultOptions: [
        {
            decorators: [...exports.DEFAULT_DECORATORS],
            order: [...exports.DEFAULT_ORDER],
            unknownPlacement: 'last',
        },
    ],
    create(context) {
        const options = context.options[0] ?? {};
        const decorators = options.decorators ?? [...exports.DEFAULT_DECORATORS];
        const unknownPlacement = options.unknownPlacement ?? 'last';
        const orderRaw = options.order ?? [...exports.DEFAULT_ORDER];
        const { slotKeys, overlayProbes, slotLabels } = normalizeOrderEntries(orderRaw);
        const orderIndex = new Map(slotKeys.map((key, i) => [key, i]));
        const sourceCode = (context.sourceCode ?? context.getSourceCode());
        return {
            Program(programNode) {
                const importMap = buildImportMap(programNode);
                for (const classDecl of iterateClasses(programNode)) {
                    if (!classMatchesDecorators(classDecl, decorators))
                        continue;
                    visitAngularClass(classDecl, importMap, {
                        context,
                        sourceCode,
                        orderIndex,
                        slotKeys,
                        overlayProbes,
                        slotLabels,
                        unknownPlacement,
                        orderRaw,
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=member-ordering.js.map