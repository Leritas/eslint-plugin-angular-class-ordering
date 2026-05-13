import type { Rule } from 'eslint';
import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const RULE_NAME = 'member-ordering';

const ANGULAR_CORE = '@angular/core';
const NGXS_STORE = '@ngxs/store';

export const DEFAULT_DECORATORS = ['Component', 'Directive', 'Injectable', 'Pipe'] as const;

/** Built-in ordering slot keys matching Angular/class member shapes. */
export const DEFAULT_ORDER = [
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
    'store-select-map',
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
] as const;

export type UnknownPlacement = 'last' | 'ignore' | 'error';

export type OrderPatternEntry = {
    type: 'pattern';
    regex: string;
    flags?: string;
};

export type OrderEntry = string | OrderPatternEntry;

export type RuleOptions = {
    decorators?: readonly string[];
    order?: readonly OrderEntry[];
    unknownPlacement?: UnknownPlacement;
};

export type MessageIds = 'wrongOrder' | 'unknownCategory';

export const messages = {
    wrongOrder:
        'Member "{{member}}" ({{actualCategoryLabel}}) must appear before "{{previousMember}}" ({{previousCategoryLabel}}). Near expected groups: {{expectedOverview}}.',
    unknownCategory: 'Member "{{member}}" does not match any ordering slot; unknownPlacement is "error".',
} satisfies Record<MessageIds, string>;

const REGEX_ORDER_PREFIX = 'regex:' as const;
const CUSTOM_FUNC_PREFIX = 'custom-func-' as const;
const CUSTOM_DEC_PREFIX = 'custom-dec-' as const;

const RANK_MODIFIERS = {
    READONLY_PENALTY: 0.5,
    ACCESSOR_SETTER_OFFSET: 1e-12,
    ORIGINAL_ORDER_TIE: 1e-6,
} as const;

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

type ImportBinding = { module: string; importedName: string };

/** Class members this rule reorders (fields + methods; excludes static blocks). */
type LintedClassMember =
    | TSESTree.PropertyDefinition
    | TSESTree.TSAbstractPropertyDefinition
    | TSESTree.MethodDefinition
    | TSESTree.TSAbstractMethodDefinition;

const createRule = ESLintUtils.RuleCreator(
    (name) => `https://github.com/Leritas/eslint-plugin-angular-class-ordering/blob/main/docs/rules/${name}.md`,
);

function isCallExpr(node: TSESTree.Node | null | undefined): node is TSESTree.CallExpression {
    return node?.type === 'CallExpression';
}

function isMemberExpr(node: TSESTree.Node | null | undefined): node is TSESTree.MemberExpression {
    return node?.type === 'MemberExpression';
}

function isIdentifier(node: TSESTree.Node | null | undefined): node is TSESTree.Identifier {
    return node?.type === 'Identifier';
}

function isPropertyLike(
    node: LintedClassMember,
): node is TSESTree.PropertyDefinition | TSESTree.TSAbstractPropertyDefinition {
    return node.type === 'PropertyDefinition' || node.type === 'TSAbstractPropertyDefinition';
}

function isLintedMember(n: TSESTree.ClassElement): n is LintedClassMember {
    return (
        n.type === 'PropertyDefinition' ||
        n.type === 'TSAbstractPropertyDefinition' ||
        n.type === 'MethodDefinition' ||
        n.type === 'TSAbstractMethodDefinition'
    );
}

function isMethod(node: LintedClassMember): node is TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition {
    return node.type === 'MethodDefinition' || node.type === 'TSAbstractMethodDefinition';
}

function isCtor(node: LintedClassMember): boolean {
    return isMethod(node) && node.kind === 'constructor';
}

function getMemberName(node: LintedClassMember): string {
    if (!node.key) return '(anonymous)';
    if (isIdentifier(node.key)) return node.key.name;
    if ('value' in node.key && typeof node.key.value === 'string') return node.key.value;
    return '(anonymous)';
}

/** Whole-string matchers. */
const CUSTOM_FUNC_ORDER_RE = /^custom-func-([\w$]+)$/;
const CUSTOM_DEC_ORDER_RE = /^custom-dec-([\w$]+)$/;

type OverlayProbe = (member: LintedClassMember, sourceCode?: TSESLint.SourceCode, memberFullText?: string) => boolean;

function overlayCustomDecoratorProbe(decoratorName: string): OverlayProbe {
    return (member: LintedClassMember) => getDecoratorNames(member.decorators).some((n) => n === decoratorName);
}

function overlayRegexProbe(rx: RegExp): OverlayProbe {
    return (_m, _sc, text) => rx.test(text ?? '');
}

/** Root expression scanned for nested custom-function calls (init or method value). */
function getMemberScratchRoot(member: LintedClassMember): TSESTree.Node | null {
    if (isPropertyLike(member)) return member.value;
    if (isMethod(member)) return member.value;
    return null;
}

function calleeMatchesCustomName(call: TSESTree.CallExpression, name: string): boolean {
    if (isIdentifier(call.callee) && call.callee.name === name) return true;
    return (
        isMemberExpr(call.callee) &&
        !call.callee.computed &&
        isIdentifier(call.callee.property) &&
        call.callee.property.name === name
    );
}

function probeCustomFunc(member: LintedClassMember, name: string): boolean {
    const root = getMemberScratchRoot(member);
    if (!root) return false;
    return exprContainsCall(root, (e) => calleeMatchesCustomName(e, name));
}

function formatOrderSlotLabel(orderRaw: readonly OrderEntry[], index: number): string {
    const entry = orderRaw[index];
    if (typeof entry === 'string') {
        if (entry.startsWith(REGEX_ORDER_PREFIX))
            return `regex:${escapeRegExpSnippet(entry.slice(REGEX_ORDER_PREFIX.length))}`;
        if (entry.startsWith(CUSTOM_FUNC_PREFIX)) return entry;
        if (entry.startsWith(CUSTOM_DEC_PREFIX)) return entry;
        return entry;
    }
    const flagsPart = entry.flags ? ` (${entry.flags})` : '';
    return `pattern:${escapeRegExpSnippet(entry.regex)}${flagsPart}`;
}

/** Short preview for error messages — avoid dumping huge regex bodies. */
function escapeRegExpSnippet(s: string, maxLen = 48): string {
    const oneLine = s.replace(/\s+/g, ' ');
    return oneLine.length <= maxLen ? oneLine : `${oneLine.slice(0, maxLen)}…`;
}

function buildNearbySlotOverview(
    orderRaw: readonly OrderEntry[],
    orderIndexBySlotKey: Map<string, number>,
    categoryA: string | null | undefined,
    categoryB: string | null | undefined,
): string {
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
    for (let j = lo; j <= hi; j++) slice.push(formatOrderSlotLabel(orderRaw, j));
    return slice.join(' → ');
}

/**
 * Validates `regex:` shorthand: body is everything after first `regex:` prefix; `:`
 * characters in the regex body itself are not supported (use `{ type:'pattern', regex }`).
 */
function normalizeOrderEntries(orderRaw: readonly OrderEntry[]): {
    slotKeys: string[];
    overlayProbes: (OverlayProbe | null)[];
    slotLabels: string[];
} {
    const slotKeys: string[] = [];
    const overlayProbes: (OverlayProbe | null)[] = [];
    const slotLabels: string[] = [];

    orderRaw.forEach((entry, i) => {
        const label = formatOrderSlotLabel(orderRaw, i);

        const pushSyntheticOverlay = (matcher: OverlayProbe | null, innerLabel: string): string => {
            const key = `__overlay_${i}`;
            overlayProbes.push(matcher ?? null);
            slotKeys.push(key);
            slotLabels.push(innerLabel);
            return key;
        };

        const pushBuiltin = (key: string): void => {
            overlayProbes.push(null);
            slotKeys.push(key);
            slotLabels.push(label);
        };

        if (typeof entry === 'string') {
            if (entry.startsWith(REGEX_ORDER_PREFIX)) {
                const regexBody = entry.slice(REGEX_ORDER_PREFIX.length);
                if (!regexBody)
                    throw new Error(`member-ordering: empty "${REGEX_ORDER_PREFIX}" order entry at index ${i}`);
                let rx: RegExp;
                try {
                    rx = new RegExp(regexBody, '');
                } catch (e) {
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
            let rx: RegExp;
            try {
                rx = new RegExp(entry.regex, entry.flags ?? '');
            } catch (e) {
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
function* iterateClasses(programNode: TSESTree.Program): Generator<TSESTree.ClassDeclaration> {
    for (const stmt of programNode.body) {
        if (stmt.type === 'ClassDeclaration') yield stmt;
        if (
            (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') &&
            stmt.declaration?.type === 'ClassDeclaration'
        ) {
            yield stmt.declaration;
        }
    }
}

/**
 * Maps local identifier names to their resolved module + imported symbol name.
 */
function buildImportMap(programNode: TSESTree.Program): Map<string, ImportBinding> {
    const map = new Map<string, ImportBinding>();
    for (const stmt of programNode.body) {
        if (stmt.type !== 'ImportDeclaration' || typeof stmt.source.value !== 'string') continue;
        const moduleName = stmt.source.value;
        for (const spec of stmt.specifiers ?? []) {
            let importedName: string | undefined;
            if (spec.type === 'ImportDefaultSpecifier') importedName = 'default';
            else if (spec.type === 'ImportSpecifier') {
                const imp = spec.imported;
                importedName =
                    imp.type === 'Identifier'
                        ? imp.name
                        : imp.type === 'Literal' && typeof imp.value === 'string'
                          ? imp.value
                          : undefined;
            }
            if (importedName) map.set(spec.local.name, { module: moduleName, importedName });
        }
    }
    return map;
}

function classMatchesDecorators(classNode: TSESTree.ClassDeclaration, decoratorNames: readonly string[]): boolean {
    const classDecorators = getDecoratorNames(classNode.decorators);
    return classDecorators.some((n) => decoratorNames.includes(n));
}

/**
 * Reads decorator call / identifier names applied to a class or member.
 */
function getDecoratorNames(decorators: TSESTree.Decorator[] | undefined): string[] {
    return (decorators ?? [])
        .map((d): string | undefined => {
            const expr = d.expression;
            if (isCallExpr(expr)) {
                if (isIdentifier(expr.callee)) return expr.callee.name;
                if (isMemberExpr(expr.callee) && !expr.callee.computed && expr.callee.property.type === 'Identifier') {
                    return expr.callee.property.name;
                }
                return undefined;
            }
            return isIdentifier(expr) ? expr.name : undefined;
        })
        .filter((n): n is string => Boolean(n));
}

/**
 * Depth-first search for a nested call matching `matcher`, stopping after `depth` steps.
 * @remarks Used to classify signal/query wrappers and chained `.selectSignal()` patterns.
 */
function exprContainsCall(
    expr: TSESTree.Node | null | undefined,
    matcher: (node: TSESTree.CallExpression) => boolean,
    depth = 16,
): boolean {
    if (!expr || depth < 0) return false;
    if (isCallExpr(expr) && matcher(expr)) return true;

    if (isCallExpr(expr)) {
        return (
            exprContainsCall(expr.callee, matcher, depth - 1) ||
            expr.arguments.some((arg) => exprContainsCall(arg, matcher, depth - 1))
        );
    }
    if (isMemberExpr(expr)) return exprContainsCall(expr.object, matcher, depth - 1);
    if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') {
        return exprContainsCall(expr.body, matcher, depth - 1);
    }
    if (expr.type === 'BlockStatement') {
        return expr.body.some((st) => {
            const loose = st as { expression?: TSESTree.Expression; argument?: TSESTree.Expression | null };
            return exprContainsCall(loose.expression ?? loose.argument ?? undefined, matcher, depth - 1);
        });
    }

    return false;
}

/**
 * Assigns a canonical ordering slot key to a class member, or `null` when no slot matches.
 */
function resolveCategory(
    member: LintedClassMember,
    importMap: Map<string, ImportBinding>,
    sourceCode: TSESLint.SourceCode,
    overlayProbes: readonly (OverlayProbe | null)[],
    slotKeys: readonly string[],
): string | null {
    const hasDeco = (names: readonly string[]) => getDecoratorNames(member.decorators).some((n) => names.includes(n));
    const init = isPropertyLike(member) ? member.value : null;

    if (isMethod(member)) {
        if (member.kind === 'constructor') return 'constructor';
        if ('abstract' in member && member.abstract) return 'abstract';
        if (member.type === 'TSAbstractMethodDefinition') return 'abstract';
        if (member.kind === 'get' || member.kind === 'set') return 'getter-setter';
    }

    if (hasDeco(['ViewChild', 'ViewChildren'])) return 'view-query-decorator';
    if (hasDeco(['ContentChild', 'ContentChildren'])) return 'content-query-decorator';
    if (hasDeco(['HostBinding'])) return 'host-binding-decorator';
    if (hasDeco(['HostListener'])) return 'host-listener-decorator';
    if (hasDeco(['Input'])) return 'input-decorator';
    if (hasDeco(['Output'])) return 'output-decorator';
    if (hasDeco(['Select'])) return 'store-select-decorator';

    const isResolvedImportCall = (node: TSESTree.CallExpression, module: string, importedName?: string): boolean => {
        if (!isIdentifier(node.callee)) return false;
        const info = importMap.get(node.callee.name);
        return info?.module === module && (!importedName || info.importedName === importedName);
    };

    const isCoreCall = (node: TSESTree.CallExpression, name?: string): boolean =>
        isResolvedImportCall(node, ANGULAR_CORE, name);

    if (isCallExpr(init)) {
        if (isCoreCall(init, 'inject')) return 'inject';

        if (isCoreCall(init, 'viewChild') || isCoreCall(init, 'viewChildren')) return 'view-query-signal';
        if (isCoreCall(init, 'contentChild') || isCoreCall(init, 'contentChildren')) return 'content-query-signal';
        if (isCoreCall(init, 'hostBinding')) return 'host-binding-signal';
        if (isCoreCall(init, 'hostListener')) return 'host-listener-signal';

        if (isCoreCall(init, 'input')) return 'input-signal';
        if (isCoreCall(init, 'output')) return 'output-signal';
        if (isCoreCall(init, 'model')) return 'model-signal';

        if (isCoreCall(init, 'signal')) return 'signal';
        if (isCoreCall(init, 'linkedSignal')) return 'linkedSignal';
        if (isCoreCall(init, 'computed')) return 'computed';

        if (isResolvedImportCall(init, NGXS_STORE, 'createSelectMap')) return 'store-select-map';
    }

    const hasCoreCall = (names: string | readonly string[]): boolean => {
        const nameArr = Array.isArray(names) ? names : [names];
        return exprContainsCall(init, (e) => nameArr.some((n) => isResolvedImportCall(e, ANGULAR_CORE, n)));
    };

    if (hasCoreCall(['viewChild', 'viewChildren'])) return 'view-query-signal';
    if (hasCoreCall(['contentChild', 'contentChildren'])) return 'content-query-signal';
    if (hasCoreCall('hostBinding')) return 'host-binding-signal';
    if (hasCoreCall('hostListener')) return 'host-listener-signal';

    if (hasCoreCall('input')) return 'input-signal';
    if (hasCoreCall('output')) return 'output-signal';
    if (hasCoreCall('model')) return 'model-signal';

    if (
        exprContainsCall(init, (e) => {
            return (
                isMemberExpr(e.callee) &&
                !e.callee.computed &&
                e.callee.property.type === 'Identifier' &&
                e.callee.property.name === 'selectSignal'
            );
        })
    ) {
        return 'store-select-signal';
    }
    if (
        exprContainsCall(init, (e) => {
            return (
                isMemberExpr(e.callee) &&
                !e.callee.computed &&
                e.callee.property.type === 'Identifier' &&
                e.callee.property.name === 'select'
            );
        })
    ) {
        return 'store-select-observable';
    }

    if (exprContainsCall(init, (e) => isResolvedImportCall(e, NGXS_STORE, 'createSelectMap'))) {
        return 'store-select-map';
    }

    if (hasCoreCall('signal')) return 'signal';
    if (hasCoreCall('linkedSignal')) return 'linkedSignal';
    if (hasCoreCall('computed')) return 'computed';

    const acc = member.accessibility ?? 'public';
    const type = isMethod(member) ? 'method' : 'field';
    const builtin = `${acc}-${member.static ? 'static' : 'instance'}-${type}`;

    const text = sourceCode.getText(member);
    let bestOverlayIdx = -1;
    for (let idx = 0; idx < overlayProbes.length; idx++) {
        const probe = overlayProbes[idx];
        if (!probe || !probe(member, sourceCode, text)) continue;
        if (bestOverlayIdx === -1 || idx < bestOverlayIdx) bestOverlayIdx = idx;
    }
    if (bestOverlayIdx !== -1) return slotKeys[bestOverlayIdx] ?? null;

    if (slotKeys.includes(builtin)) return builtin;

    return null;
}

type AccessorPairIndices = { get: number; set: number };

/**
 * Forces getters/setters for the same property name to share one slot category for stable pairing.
 */
function alignAccessorPairs(
    members: LintedClassMember[],
    categories: (string | null)[],
    orderIndex: Map<string, number>,
): Map<string, AccessorPairIndices> {
    const pairs = new Map<string, AccessorPairIndices>();
    members.forEach((m, i) => {
        if (isMethod(m) && (m.kind === 'get' || m.kind === 'set')) {
            const key = getMemberName(m);
            if (!pairs.has(key)) pairs.set(key, { get: -1, set: -1 });
            const entry = pairs.get(key);
            if (entry) {
                if (m.kind === 'get') entry.get = i;
                else if (m.kind === 'set') entry.set = i;
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
function calculateRanks(
    members: LintedClassMember[],
    categories: (string | null)[],
    orderIndex: Map<string, number>,
    unknownPlacement: UnknownPlacement,
    slotKeysLength: number,
): {
    ranks: (number | null)[];
    skipFlags: boolean[];
    unknownErrors: number[];
} {
    const pairs = alignAccessorPairs(members, categories, orderIndex);

    const ranks = members.map<number | null>(() => null);
    const skipFlags = members.map(() => false);
    const unknownErrors: number[] = [];

    members.forEach((m, i) => {
        const category = categories[i];
        const idx = category !== null && category !== undefined ? orderIndex.get(category) : undefined;
        const readonlyPenalty =
            isPropertyLike(m) && 'readonly' in m && m.readonly ? RANK_MODIFIERS.READONLY_PENALTY : 0;
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
            ranks[set] = ranks[get]! + RANK_MODIFIERS.ACCESSOR_SETTER_OFFSET;
        }
    }

    return { ranks, skipFlags, unknownErrors };
}

type VisitContext = {
    context: Readonly<TSESLint.RuleContext<MessageIds, readonly unknown[]>>;
    sourceCode: TSESLint.SourceCode;
    orderIndex: Map<string, number>;
    slotKeys: string[];
    overlayProbes: (OverlayProbe | null)[];
    slotLabels: string[];
    unknownPlacement: UnknownPlacement;
    orderRaw: readonly OrderEntry[];
};

function slotLabelFromCategory(
    slotLabels: readonly string[],
    orderIndex: Map<string, number>,
    category: string | null | undefined,
): string {
    if (category === null || category === undefined) return 'unknown';
    const idx = orderIndex.get(category);
    if (idx !== undefined && slotLabels[idx] !== undefined) return slotLabels[idx];
    return category;
}

/** ESLint fixer API used when rewriting class bodies (avoid coupling to ESTree variant mismatches). */
type TextFixer = {
    replaceTextRange(range: [number, number], text: string): Rule.Fix;
};

function visitAngularClass(
    classNode: TSESTree.ClassDeclaration,
    importMap: Map<string, ImportBinding>,
    ctx: VisitContext,
): void {
    const { context, sourceCode, orderIndex, slotKeys, overlayProbes, slotLabels, unknownPlacement, orderRaw } = ctx;
    const members = classNode.body.body.filter(isLintedMember);

    const categories = members.map((m) => resolveCategory(m, importMap, sourceCode, overlayProbes, slotKeys));
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

    const tracked = members
        .map((m, i) => ({ m, i, rank: ranks[i] }))
        .filter((x): x is { m: LintedClassMember; i: number; rank: number } => !skipFlags[x.i] && x.rank != null);
    const sorted = [...tracked].sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.i - b.i));

    const violationIdx = tracked.findIndex((item, idx) => item.i !== sorted[idx].i);

    if (violationIdx !== -1) {
        const wrongNode = tracked[violationIdx];
        const previousNode = sorted[violationIdx - 1] ?? sorted[0];

        const baseReport = {
            node: wrongNode.m,
            messageId: 'wrongOrder' as const,
            data: {
                member: getMemberName(wrongNode.m),
                actualCategoryLabel: slotLabelFromCategory(slotLabels, orderIndex, categories[wrongNode.i]),
                previousMember: getMemberName(previousNode.m),
                previousCategoryLabel: slotLabelFromCategory(slotLabels, orderIndex, categories[previousNode.i]),
                expectedOverview: buildNearbySlotOverview(
                    orderRaw,
                    orderIndex,
                    categories[wrongNode.i],
                    categories[previousNode.i],
                ),
            },
        };

        if (unknownErrors.length === 0 && unknownPlacement !== 'error') {
            context.report({
                ...baseReport,
                fix: (fixer) =>
                    FixerEngine.run(
                        fixer as unknown as TextFixer,
                        sourceCode,
                        classNode.body,
                        members,
                        ranks,
                        categories,
                    ),
            });
        } else {
            context.report(baseReport);
        }
    }
}

type OrderedChunk = {
    member: LintedClassMember;
    i: number;
    rank: number | null;
    category: string | null;
    raw: string;
};

const FixerEngine = {
    /**
     * Replaces class body interior text with members sorted by ascending rank while preserving captured trivia slices.
     */
    run(
        fixer: TextFixer,
        sourceCode: TSESLint.SourceCode,
        classBody: TSESTree.ClassBody,
        members: LintedClassMember[],
        ranks: (number | null)[],
        categories: (string | null)[],
    ): Rule.Fix {
        const braceOpen = sourceCode.getFirstToken(classBody as TSESTree.Node, (t) => t.value === '{');
        const innerStart = braceOpen?.range[1] ?? classBody.range[0] + 1;
        const innerEnd = classBody.range[1] - 1;

        const ranges: [number, number][] = [];
        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            const next = members[i + 1];
            const prevEndLine = i > 0 ? members[i - 1].loc.end.line : -1;
            const commentsBefore = sourceCode.getCommentsBefore(member).filter((c) => c.loc.start.line !== prevEndLine);
            let start = commentsBefore.length > 0 ? commentsBefore[0].range[0] : member.range[0];

            while (start > innerStart && sourceCode.text[start - 1] !== '\n') start--;

            if (ranges.length > 0) {
                start = Math.max(start, ranges[i - 1][1]);
            }

            const nextComments = next
                ? sourceCode.getCommentsBefore(next).filter((c) => c.loc.start.line !== member.loc.end.line)
                : [];
            const cap = next ? (nextComments[0]?.range[0] ?? next.range[0]) : innerEnd;
            let end = member.range[1];
            const memberEndLine = member.loc.end.line;
            let hasInlineTrailing = false;

            for (const c of sourceCode.getCommentsAfter(member)) {
                const cStart = c.range?.[0];
                const cEnd = c.range?.[1];
                if (cStart === undefined || cEnd === undefined) continue;
                if (c.loc.start.line === memberEndLine) {
                    end = Math.max(end, cEnd);
                    hasInlineTrailing = true;
                    continue;
                }
                if (cStart >= cap) break;
                end = Math.max(end, cEnd);
            }
            ranges.push([start, hasInlineTrailing ? end : Math.min(end, cap)]);
        }

        const ordered: OrderedChunk[] = members
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
            if (k > 0) newText += FixerEngine.calculateGap(ordered[k - 1], chunk, sourceCode);
            newText += chunk.raw;
        });

        const trailingGap = sourceCode.text.slice(innerStart, innerEnd).match(/(\n(?:[ \t]*\n)*[ \t]*)$/)?.[1] ?? '\n';
        const finalReplacement = newText.trimEnd() ? `\n${newText.trimEnd()}${trailingGap}` : trailingGap;

        return fixer.replaceTextRange([innerStart, innerEnd], finalReplacement);
    },

    /**
     * Chooses blank-line spacing between two consecutive chunks based on member kinds and categories.
     */
    calculateGap(prev: OrderedChunk, curr: OrderedChunk, sourceCode: TSESLint.SourceCode): string {
        const isMethodNonCtor = (m: LintedClassMember): boolean => isMethod(m) && m.kind !== 'constructor';

        if (
            isMethod(prev.member) &&
            isMethod(curr.member) &&
            (prev.member.kind === 'get' || prev.member.kind === 'set') &&
            (curr.member.kind === 'get' || curr.member.kind === 'set') &&
            getMemberName(prev.member) === getMemberName(curr.member)
        ) {
            return '\n';
        }

        const hasComments = sourceCode.getCommentsBefore(curr.member).length > 0;
        if (isCtor(prev.member) && !isCtor(curr.member)) return '\n\n';
        if (isMethodNonCtor(prev.member) || isMethodNonCtor(curr.member)) return '\n\n';
        if (hasComments) return '\n\n';
        if (prev.category !== curr.category) return '\n\n';

        const currHasDecorators = (curr.member.decorators?.length ?? 0) > 0;
        if (currHasDecorators) return '\n\n';

        const prRo = isPropertyLike(prev.member) && prev.member.readonly;
        const crRo = isPropertyLike(curr.member) && curr.member.readonly;
        return !prRo && crRo ? '\n\n' : '\n';
    },
};

export const rule = createRule({
    name: RULE_NAME,
    meta: {
        type: 'layout',
        docs: {
            description: 'Enforces Angular-aware ordering for fields/methods in Angular decorated classes.',
        },
        fixable: 'code',
        schema: [optionsSchema as never],
        messages,
    },
    defaultOptions: [
        {
            decorators: [...DEFAULT_DECORATORS],
            order: [...DEFAULT_ORDER],
            unknownPlacement: 'last',
        } satisfies RuleOptions,
    ],
    create(context) {
        const options = context.options[0] ?? {};
        const decorators = options.decorators ?? [...DEFAULT_DECORATORS];
        const unknownPlacement = options.unknownPlacement ?? 'last';
        const orderRaw = options.order ?? [...DEFAULT_ORDER];

        const { slotKeys, overlayProbes, slotLabels } = normalizeOrderEntries(orderRaw);
        const orderIndex = new Map(slotKeys.map((key, i): [string, number] => [key, i]));
        const sourceCode = (context.sourceCode ?? context.getSourceCode()) as TSESLint.SourceCode;

        return {
            Program(programNode: TSESTree.Program) {
                const importMap = buildImportMap(programNode);

                for (const classDecl of iterateClasses(programNode)) {
                    if (!classMatchesDecorators(classDecl, decorators)) continue;

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
