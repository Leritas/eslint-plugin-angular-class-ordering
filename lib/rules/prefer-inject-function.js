"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rule = exports.preferInjectMessages = exports.RULE_NAME = void 0;
const utils_1 = require("@typescript-eslint/utils");
const injection_context_utils_1 = require("./injection-context.utils");
exports.RULE_NAME = 'prefer-inject-function';
const createRule = utils_1.ESLintUtils.RuleCreator((name) => `https://github.com/Leritas/eslint-plugin-angular-class-ordering/blob/main/docs/rules/${name}.md`);
exports.preferInjectMessages = {
    preferInject: 'Prefer `inject()` instead of constructor injection for `{{name}}`.{{details}}',
};
function findAngularCoreImport(program) {
    for (const s of program.body) {
        if (s.type === 'ImportDeclaration' && s.source.value === injection_context_utils_1.ANGULAR_CORE)
            return s;
    }
    return null;
}
function collectImportFixes(program, need) {
    const fixes = [];
    if (!need.inject && !need.hostAttributeToken)
        return fixes;
    const existing = findAngularCoreImport(program);
    const importedNames = new Set();
    if (existing) {
        for (const spec of existing.specifiers ?? []) {
            if (spec.type === 'ImportSpecifier') {
                const imp = spec.imported;
                const iname = imp.type === 'Identifier'
                    ? imp.name
                    : imp.type === 'Literal' && typeof imp.value === 'string'
                        ? imp.value
                        : null;
                if (iname)
                    importedNames.add(iname);
            }
        }
    }
    const toAdd = [];
    if (need.inject && !importedNames.has('inject'))
        toAdd.push('inject');
    if (need.hostAttributeToken && !importedNames.has('HostAttributeToken'))
        toAdd.push('HostAttributeToken');
    if (!toAdd.length)
        return fixes;
    if (!existing) {
        const names = toAdd.join(', ');
        fixes.push({
            range: [0, 0],
            text: `import { ${names} } from '${injection_context_utils_1.ANGULAR_CORE}';\n`,
        });
        return fixes;
    }
    const lastSpec = existing.specifiers?.[existing.specifiers.length - 1];
    if (!lastSpec?.range)
        return fixes;
    fixes.push({
        range: [lastSpec.range[1], lastSpec.range[1]],
        text: `, ${toAdd.join(', ')}`,
    });
    return fixes;
}
/** Indentation of the constructor `MethodDefinition` line inside the class body. */
function getClassMemberIndent(sourceCode, member) {
    const before = sourceCode.text.slice(0, member.range[0]);
    const lineStart = before.lastIndexOf('\n') + 1;
    const linePrefix = before.slice(lineStart);
    return /^(\s*)/.exec(linePrefix)?.[1] ?? '    ';
}
/** Source range of the inside of `(...)` for a function (constructor) parameter list. */
function getParamListInnerRange(sourceCode, fn) {
    const offset = fn.range[0];
    const text = sourceCode.getText(fn);
    let depth = 0;
    let paramOpen = -1;
    let paramClose = -1;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '(') {
            if (depth === 0)
                paramOpen = i + 1;
            depth++;
        }
        else if (c === ')') {
            depth--;
            if (depth === 0 && paramOpen !== -1) {
                paramClose = i;
                break;
            }
        }
    }
    if (paramOpen < 0 || paramClose < 0)
        return [fn.range[1], fn.range[1]];
    return [offset + paramOpen, offset + paramClose];
}
function buildMigrateFieldsText(toMigrate, memberIndent) {
    const fieldIndent = memberIndent;
    return toMigrate
        .map((m) => {
        const opt = (0, injection_context_utils_1.formatInjectOptions)(m.injectOptions);
        const second = opt ? `, ${opt}` : '';
        return `${fieldIndent}${m.modifiers} ${m.name} = inject(${m.injectFirstArg}${second});`;
    })
        .join('\n');
}
/**
 * TypeScript parameter properties share one scope entry with the constructor body in eslint-scope,
 * so `const svc` does not hide the parameter in `variable.references`. Detect shadowing via AST.
 */
function isShadowedByConstOrLetBeforeRef(refId, paramName, parentMap) {
    let node = refId;
    while (node) {
        const nextParent = parentMap.get(node) ?? null;
        if (!nextParent)
            break;
        if (nextParent.type === 'BlockStatement') {
            const block = nextParent;
            for (const stmt of block.body) {
                if (stmt.range[0] >= refId.range[0])
                    break;
                if (stmt.type === 'VariableDeclaration' && (stmt.kind === 'const' || stmt.kind === 'let')) {
                    for (const d of stmt.declarations) {
                        if (d.id.type === 'Identifier' && d.id.name === paramName)
                            return true;
                    }
                }
            }
        }
        node = nextParent;
    }
    return false;
}
function collectThisPrefixFixes(sourceCode, fn, migrated) {
    const fixes = [];
    const scopeManager = sourceCode.scopeManager;
    if (!scopeManager)
        return fixes;
    const fnScope = scopeManager.acquire(fn);
    if (!fnScope)
        return fixes;
    const parentMap = (0, injection_context_utils_1.buildParentMap)(fn);
    for (const m of migrated) {
        const variable = fnScope.variables.find((vi) => vi.name === m.name && vi.defs.some((d) => d.type === 'Parameter'));
        if (!variable)
            continue;
        const binding = (0, injection_context_utils_1.getBindingFromParam)(m.paramNode);
        for (const ref of variable.references) {
            if (!ref.isRead())
                continue;
            if (ref.identifier.type === 'Identifier' &&
                isShadowedByConstOrLetBeforeRef(ref.identifier, m.name, parentMap))
                continue;
            if (binding?.range &&
                ref.identifier.range &&
                ref.identifier.range[0] >= binding.range[0] &&
                ref.identifier.range[1] <= binding.range[1]) {
                continue;
            }
            const id = ref.identifier;
            const parent = parentMap.get(id);
            if (parent?.type === 'MemberExpression' &&
                !parent.computed &&
                parent.object.type === 'ThisExpression' &&
                parent.property === id) {
                continue;
            }
            if (parent?.type === 'Property' &&
                'shorthand' in parent &&
                parent.shorthand &&
                parent.key === id) {
                const keyText = sourceCode.getText(parent.key);
                fixes.push({
                    range: [parent.range[0], parent.range[1]],
                    text: `${keyText}: this.${m.name}`,
                });
                continue;
            }
            fixes.push({
                range: id.range,
                text: `this.${m.name}`,
            });
        }
    }
    fixes.sort((a, b) => b.range[0] - a.range[0]);
    return fixes;
}
function buildConstructorParamListFix(sourceCode, fn, toMigrate, importMap) {
    const migrateSet = new Set(toMigrate.map((t) => t.paramNode));
    const kept = fn.params.filter((p) => {
        if (!(0, injection_context_utils_1.isDiConstructorParam)(p, importMap))
            return true;
        return !migrateSet.has(p);
    });
    const innerRange = getParamListInnerRange(sourceCode, fn);
    const newInner = kept.map((p) => sourceCode.getText(p)).join(', ');
    return { range: innerRange, text: newInner };
}
function buildInsertFieldsFix(sourceCode, ctor, toMigrate) {
    if (!toMigrate.length)
        return null;
    const indent = getClassMemberIndent(sourceCode, ctor);
    const fields = buildMigrateFieldsText(toMigrate, indent);
    const pos = ctor.range[1];
    return {
        range: [pos, pos],
        text: `\n\n${fields}`,
    };
}
function buildAllFixes(sourceCode, ctor, toMigrate, importMap) {
    const fn = ctor.value;
    if (fn.type !== 'FunctionExpression' || !fn.body)
        return [];
    const need = {
        inject: true,
        hostAttributeToken: toMigrate.some((m) => m.usesAttributeDecorator),
    };
    const program = sourceCode.ast;
    const out = [];
    out.push(...collectImportFixes(program, need));
    const paramFix = buildConstructorParamListFix(sourceCode, fn, toMigrate, importMap);
    if (paramFix)
        out.push(paramFix);
    out.push(...collectThisPrefixFixes(sourceCode, fn, toMigrate));
    const insertFix = buildInsertFieldsFix(sourceCode, ctor, toMigrate);
    if (insertFix)
        out.push(insertFix);
    out.sort((a, b) => b.range[0] - a.range[0]);
    return out;
}
exports.rule = createRule({
    name: exports.RULE_NAME,
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
        messages: exports.preferInjectMessages,
    },
    defaultOptions: [
        {
            decorators: [...injection_context_utils_1.DEFAULT_INJECT_RULE_DECORATORS],
            autofix: true,
        },
    ],
    create(context, [options = {}]) {
        const decorators = options.decorators ?? [...injection_context_utils_1.DEFAULT_INJECT_RULE_DECORATORS];
        const autofix = options.autofix !== false;
        const sourceCode = context.sourceCode;
        const program = sourceCode.ast;
        const importMap = (0, injection_context_utils_1.buildImportMap)(program);
        return {
            Program() {
                for (const classNode of (0, injection_context_utils_1.iterateClasses)(program)) {
                    if (!(0, injection_context_utils_1.classMatchesDecorators)(classNode, decorators))
                        continue;
                    const ctor = (0, injection_context_utils_1.findConstructor)(classNode.body);
                    if (!ctor)
                        continue;
                    const analyses = (0, injection_context_utils_1.analyzeDiParams)(classNode, ctor, importMap, sourceCode);
                    const reportable = analyses.filter((a) => !a.unsafeForSuperField);
                    const batchMigrate = reportable.filter((x) => !x.unsupportedDecorator && Boolean(x.injectFirstArg));
                    let offerBatchFix = autofix && batchMigrate.length > 0;
                    for (const a of reportable) {
                        const rowFixable = !a.unsupportedDecorator && Boolean(a.injectFirstArg);
                        const attachFix = offerBatchFix && rowFixable;
                        if (attachFix)
                            offerBatchFix = false;
                        const details = a.unsupportedDecorator ? ' Unsupported decorators or token; fix manually.' : '';
                        context.report({
                            node: a.paramNode,
                            messageId: 'preferInject',
                            data: { name: a.name, details },
                            fix: attachFix && batchMigrate.length
                                ? (fixer) => {
                                    const fixes = buildAllFixes(sourceCode, ctor, batchMigrate, importMap);
                                    if (!fixes.length)
                                        return null;
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
//# sourceMappingURL=prefer-inject-function.js.map