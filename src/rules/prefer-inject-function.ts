import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ESLintUtils } from '@typescript-eslint/utils';

import {
    analyzeDiParams,
    ANGULAR_CORE,
    buildImportMap,
    buildParentMap,
    classMatchesDecorators,
    DEFAULT_INJECT_RULE_DECORATORS,
    findConstructor,
    formatInjectOptions,
    getBindingFromParam,
    isDiConstructorParam,
    iterateClasses,
    type DiParamAnalysis,
    type ImportBinding,
} from './injection-context.utils';

export const RULE_NAME = 'prefer-inject-function';

const createRule = ESLintUtils.RuleCreator(
    (name) => `https://github.com/Leritas/eslint-plugin-angular-class-ordering/blob/main/docs/rules/${name}.md`,
);

export type PreferInjectMessageIds = 'preferInject';

export const preferInjectMessages = {
    preferInject: 'Prefer `inject()` instead of constructor injection for `{{name}}`.{{details}}',
} satisfies Record<PreferInjectMessageIds, string>;

type RuleOptions = {
    decorators?: string[];
    /** When `false`, never emit fixes. Default `true`. */
    autofix?: boolean;
};

type OptionsTuple = [RuleOptions?];

function findAngularCoreImport(program: TSESTree.Program): TSESTree.ImportDeclaration | null {
    for (const s of program.body) {
        if (s.type === 'ImportDeclaration' && s.source.value === ANGULAR_CORE) return s;
    }
    return null;
}

type ImportNeed = { inject: boolean; hostAttributeToken: boolean };

function collectImportFixes(program: TSESTree.Program, need: ImportNeed): TSESLint.RuleFix[] {
    const fixes: TSESLint.RuleFix[] = [];
    if (!need.inject && !need.hostAttributeToken) return fixes;

    const existing = findAngularCoreImport(program);
    const importedNames = new Set<string>();

    if (existing) {
        for (const spec of existing.specifiers ?? []) {
            if (spec.type === 'ImportSpecifier') {
                const imp = spec.imported;
                const iname =
                    imp.type === 'Identifier'
                        ? imp.name
                        : imp.type === 'Literal' && typeof imp.value === 'string'
                          ? imp.value
                          : null;
                if (iname) importedNames.add(iname);
            }
        }
    }

    const toAdd: string[] = [];
    if (need.inject && !importedNames.has('inject')) toAdd.push('inject');
    if (need.hostAttributeToken && !importedNames.has('HostAttributeToken')) toAdd.push('HostAttributeToken');

    if (!toAdd.length) return fixes;

    if (!existing) {
        const names = toAdd.join(', ');
        fixes.push({
            range: [0, 0],
            text: `import { ${names} } from '${ANGULAR_CORE}';\n`,
        });
        return fixes;
    }

    const lastSpec = existing.specifiers?.[existing.specifiers.length - 1];
    if (!lastSpec?.range) return fixes;
    fixes.push({
        range: [lastSpec.range[1], lastSpec.range[1]],
        text: `, ${toAdd.join(', ')}`,
    });
    return fixes;
}

/** Indentation of the constructor `MethodDefinition` line inside the class body. */
function getClassMemberIndent(sourceCode: TSESLint.SourceCode, member: TSESTree.MethodDefinition): string {
    const before = sourceCode.text.slice(0, member.range![0]);
    const lineStart = before.lastIndexOf('\n') + 1;
    const linePrefix = before.slice(lineStart);
    return /^(\s*)/.exec(linePrefix)?.[1] ?? '    ';
}

/** Source range of the inside of `(...)` for a function (constructor) parameter list. */
function getParamListInnerRange(sourceCode: TSESLint.SourceCode, fn: TSESTree.FunctionExpression): TSESLint.AST.Range {
    const offset = fn.range![0];
    const text = sourceCode.getText(fn);
    let depth = 0;
    let paramOpen = -1;
    let paramClose = -1;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '(') {
            if (depth === 0) paramOpen = i + 1;
            depth++;
        } else if (c === ')') {
            depth--;
            if (depth === 0 && paramOpen !== -1) {
                paramClose = i;
                break;
            }
        }
    }
    if (paramOpen < 0 || paramClose < 0) return [fn.range![1], fn.range![1]];
    return [offset + paramOpen, offset + paramClose];
}

function buildMigrateFieldsText(toMigrate: DiParamAnalysis[], memberIndent: string): string {
    const fieldIndent = memberIndent;
    return toMigrate
        .map((m) => {
            const opt = formatInjectOptions(m.injectOptions);
            const second = opt ? `, ${opt}` : '';
            return `${fieldIndent}${m.modifiers} ${m.name} = inject(${m.injectFirstArg}${second});`;
        })
        .join('\n');
}

/**
 * TypeScript parameter properties share one scope entry with the constructor body in eslint-scope,
 * so `const svc` does not hide the parameter in `variable.references`. Detect shadowing via AST.
 */
function isShadowedByConstOrLetBeforeRef(
    refId: TSESTree.Identifier,
    paramName: string,
    parentMap: Map<TSESTree.Node, TSESTree.Node | null>,
): boolean {
    let node: TSESTree.Node | null | undefined = refId;
    while (node) {
        const nextParent: TSESTree.Node | null = parentMap.get(node) ?? null;
        if (!nextParent) break;
        if (nextParent.type === 'BlockStatement') {
            const block = nextParent;
            for (const stmt of block.body) {
                if (stmt.range![0] >= refId.range![0]) break;
                if (stmt.type === 'VariableDeclaration' && (stmt.kind === 'const' || stmt.kind === 'let')) {
                    for (const d of stmt.declarations) {
                        if (d.id.type === 'Identifier' && d.id.name === paramName) return true;
                    }
                }
            }
        }
        node = nextParent;
    }
    return false;
}

function collectThisPrefixFixes(
    sourceCode: TSESLint.SourceCode,
    fn: TSESTree.FunctionExpression,
    migrated: DiParamAnalysis[],
): TSESLint.RuleFix[] {
    const fixes: TSESLint.RuleFix[] = [];
    const scopeManager = sourceCode.scopeManager;
    if (!scopeManager) return fixes;

    const fnScope = scopeManager.acquire(fn);
    if (!fnScope) return fixes;

    const parentMap = buildParentMap(fn);

    for (const m of migrated) {
        const variable = fnScope.variables.find(
            (vi) => vi.name === m.name && vi.defs.some((d) => d.type === 'Parameter'),
        );
        if (!variable) continue;

        const binding = getBindingFromParam(m.paramNode);

        for (const ref of variable.references) {
            if (!ref.isRead()) continue;
            if (
                ref.identifier.type === 'Identifier' &&
                isShadowedByConstOrLetBeforeRef(ref.identifier, m.name, parentMap)
            )
                continue;
            if (
                binding?.range &&
                ref.identifier.range &&
                ref.identifier.range[0] >= binding.range[0] &&
                ref.identifier.range[1] <= binding.range[1]
            ) {
                continue;
            }
            const id = ref.identifier;
            const parent = parentMap.get(id);
            if (
                parent?.type === 'MemberExpression' &&
                !parent.computed &&
                parent.object.type === 'ThisExpression' &&
                parent.property === id
            ) {
                continue;
            }
            if (
                parent?.type === 'Property' &&
                'shorthand' in parent &&
                (parent as TSESTree.Property).shorthand &&
                (parent as TSESTree.Property).key === id
            ) {
                const keyText = sourceCode.getText((parent as TSESTree.Property).key);
                fixes.push({
                    range: [parent.range![0], parent.range![1]],
                    text: `${keyText}: this.${m.name}`,
                });
                continue;
            }
            fixes.push({
                range: id.range!,
                text: `this.${m.name}`,
            });
        }
    }

    fixes.sort((a, b) => b.range[0] - a.range[0]);
    return fixes;
}

function buildConstructorParamListFix(
    sourceCode: TSESLint.SourceCode,
    fn: TSESTree.FunctionExpression,
    toMigrate: DiParamAnalysis[],
    importMap: Map<string, ImportBinding>,
): TSESLint.RuleFix | null {
    const migrateSet = new Set(toMigrate.map((t) => t.paramNode));
    const kept = fn.params.filter((p) => {
        if (!isDiConstructorParam(p, importMap)) return true;
        return !migrateSet.has(p);
    });

    const innerRange = getParamListInnerRange(sourceCode, fn);
    const newInner = kept.map((p) => sourceCode.getText(p)).join(', ');
    return { range: innerRange, text: newInner };
}

function buildInsertFieldsFix(
    sourceCode: TSESLint.SourceCode,
    ctor: TSESTree.MethodDefinition,
    toMigrate: DiParamAnalysis[],
): TSESLint.RuleFix | null {
    if (!toMigrate.length) return null;
    const indent = getClassMemberIndent(sourceCode, ctor);
    const fields = buildMigrateFieldsText(toMigrate, indent);
    const pos = ctor.range![1];
    return {
        range: [pos, pos],
        text: `\n\n${fields}`,
    };
}

function buildAllFixes(
    sourceCode: TSESLint.SourceCode,
    ctor: TSESTree.MethodDefinition & { kind: 'constructor' },
    toMigrate: DiParamAnalysis[],
    importMap: Map<string, ImportBinding>,
): TSESLint.RuleFix[] {
    const fn = ctor.value;
    if (fn.type !== 'FunctionExpression' || !fn.body) return [];

    const need: ImportNeed = {
        inject: true,
        hostAttributeToken: toMigrate.some((m) => m.usesAttributeDecorator),
    };

    const program = sourceCode.ast as TSESTree.Program;
    const out: TSESLint.RuleFix[] = [];

    out.push(...collectImportFixes(program, need));

    const paramFix = buildConstructorParamListFix(sourceCode, fn, toMigrate, importMap);
    if (paramFix) out.push(paramFix);

    out.push(...collectThisPrefixFixes(sourceCode, fn, toMigrate));

    const insertFix = buildInsertFieldsFix(sourceCode, ctor, toMigrate);
    if (insertFix) out.push(insertFix);

    out.sort((a, b) => b.range[0] - a.range[0]);
    return out;
}

export const rule = createRule<OptionsTuple, PreferInjectMessageIds>({
    name: RULE_NAME,
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer Angular `inject()` over constructor parameter injection.',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    decorators: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    autofix: { type: 'boolean' },
                },
            },
        ],
        messages: preferInjectMessages,
    },
    defaultOptions: [
        {
            decorators: [...DEFAULT_INJECT_RULE_DECORATORS],
            autofix: true,
        },
    ],
    create(context, [options = {}]) {
        const decorators = options.decorators ?? [...DEFAULT_INJECT_RULE_DECORATORS];
        const autofix = options.autofix !== false;
        const sourceCode = context.sourceCode;
        const program = sourceCode.ast as TSESTree.Program;
        const importMap = buildImportMap(program);

        return {
            Program() {
                for (const classNode of iterateClasses(program)) {
                    if (!classMatchesDecorators(classNode, decorators)) continue;
                    const ctor = findConstructor(classNode.body);
                    if (!ctor) continue;

                    const analyses = analyzeDiParams(classNode, ctor, importMap, sourceCode);
                    const reportable = analyses.filter((a) => !a.unsafeForSuperField);
                    const batchMigrate = reportable.filter((x) => !x.unsupportedDecorator && Boolean(x.injectFirstArg));

                    let offerBatchFix = autofix && batchMigrate.length > 0;

                    for (const a of reportable) {
                        const rowFixable = !a.unsupportedDecorator && Boolean(a.injectFirstArg);
                        const attachFix = offerBatchFix && rowFixable;
                        if (attachFix) offerBatchFix = false;

                        const details = a.unsupportedDecorator ? ' Unsupported decorators or token; fix manually.' : '';

                        context.report({
                            node: a.paramNode,
                            messageId: 'preferInject',
                            data: { name: a.name, details },
                            fix:
                                attachFix && batchMigrate.length
                                    ? (fixer) => {
                                          const fixes = buildAllFixes(sourceCode, ctor, batchMigrate, importMap);
                                          if (!fixes.length) return null;
                                          return fixes.map((f) => fixer.replaceTextRange(f.range, f.text));
                                      }
                                    : undefined,
                        });
                    }
                }
            },
        };
    },
});
