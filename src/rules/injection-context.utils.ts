import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { visitorKeys } from '@typescript-eslint/visitor-keys';

export const ANGULAR_CORE = '@angular/core';

export const DEFAULT_INJECT_RULE_DECORATORS = ['Component', 'Directive', 'Injectable', 'Pipe'] as const;

export type ImportBinding = { module: string; importedName: string };

export function buildImportMap(programNode: TSESTree.Program): Map<string, ImportBinding> {
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

export function* iterateClasses(programNode: TSESTree.Program): Generator<TSESTree.ClassDeclaration> {
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

export function getDecoratorNames(decorators: TSESTree.Decorator[] | undefined): string[] {
    return (decorators ?? [])
        .map((d): string | undefined => {
            const expr = d.expression;
            if (expr.type === 'CallExpression') {
                if (expr.callee.type === 'Identifier') return expr.callee.name;
                if (
                    expr.callee.type === 'MemberExpression' &&
                    !expr.callee.computed &&
                    expr.callee.property.type === 'Identifier'
                ) {
                    return expr.callee.property.name;
                }
                return undefined;
            }
            return expr.type === 'Identifier' ? expr.name : undefined;
        })
        .filter((n): n is string => Boolean(n));
}

export function classMatchesDecorators(
    classNode: TSESTree.ClassDeclaration,
    decoratorNames: readonly string[],
): boolean {
    const classDecorators = getDecoratorNames(classNode.decorators);
    return classDecorators.some((n) => decoratorNames.includes(n));
}

export function getDecoratorImportedName(
    dec: TSESTree.Decorator,
    importMap: Map<string, ImportBinding>,
): string | null {
    const expr = dec.expression;
    if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier') {
        const loc = expr.callee.name;
        const b = importMap.get(loc);
        if (b?.module === ANGULAR_CORE) return b.importedName;
        return expr.callee.name;
    }
    if (expr.type === 'Identifier') {
        const b = importMap.get(expr.name);
        if (b?.module === ANGULAR_CORE) return b.importedName;
        return expr.name;
    }
    return null;
}

function traverseChildren(node: TSESTree.Node, visit: (child: TSESTree.Node) => void): void {
    const keys = visitorKeys[node.type] ?? [];
    for (const key of keys) {
        const v = (node as unknown as Record<string, unknown>)[key];
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
            for (const item of v) {
                if (item && typeof item === 'object' && item !== null && 'type' in item) {
                    visit(item as TSESTree.Node);
                }
            }
        } else if (typeof v === 'object' && v !== null && 'type' in v) {
            visit(v as TSESTree.Node);
        }
    }
}

/** Build parent pointers for subtree (no AST mutation). */
export function buildParentMap(root: TSESTree.Node): Map<TSESTree.Node, TSESTree.Node | null> {
    const parents = new Map<TSESTree.Node, TSESTree.Node | null>();
    const visit = (node: TSESTree.Node, parent: TSESTree.Node | null): void => {
        parents.set(node, parent);
        traverseChildren(node, (child) => visit(child, node));
    };
    visit(root, null);
    return parents;
}

export function findConstructor(
    classBody: TSESTree.ClassBody,
): (TSESTree.MethodDefinition & { kind: 'constructor' }) | null {
    for (const el of classBody.body) {
        if (
            el.type === 'MethodDefinition' &&
            el.kind === 'constructor' &&
            el.static === false &&
            el.value.type === 'FunctionExpression'
        ) {
            return el as TSESTree.MethodDefinition & { kind: 'constructor' };
        }
    }
    return null;
}

export function findFirstSuperCall(body: TSESTree.BlockStatement): TSESTree.CallExpression | null {
    let best: TSESTree.CallExpression | null = null;
    const walk = (n: TSESTree.Node): void => {
        if (n.type === 'CallExpression' && n.callee.type === 'Super') {
            if (!best || n.range![0] < best.range![0]) best = n;
        }
        traverseChildren(n, walk);
    };
    walk(body);
    return best;
}

/**
 * Whether a reference to a constructor parameter must stay in the constructor
 * (cannot become a field initializer) due to `super()` ordering.
 */
export function isParamRefUnsafeForSuperField(
    refIdentifier: TSESTree.Identifier,
    firstSuper: TSESTree.CallExpression,
    parentMap: Map<TSESTree.Node, TSESTree.Node | null>,
): boolean {
    if (refIdentifier.range![0] >= firstSuper.range![1]) return false;

    let n: TSESTree.Node | null | undefined = refIdentifier;
    while (n) {
        const parentNode: TSESTree.Node | null = parentMap.get(n) ?? null;
        if (!parentNode) break;
        if (parentNode.type === 'CallExpression' && parentNode.callee.type === 'Super') {
            return true;
        }
        if (parentNode.type === 'ArrowFunctionExpression' || parentNode.type === 'FunctionExpression') {
            const gp = parentMap.get(parentNode) ?? null;
            if (gp?.type === 'CallExpression' && gp.callee === parentNode) {
                return true;
            }
            return false;
        }
        n = parentNode;
    }
    return refIdentifier.range![0] < firstSuper.range![1];
}

export type InjectOptionFlags = {
    optional?: boolean;
    host?: boolean;
    self?: boolean;
    skipSelf?: boolean;
};

export type DiParamAnalysis = {
    paramNode: TSESTree.TSParameterProperty | TSESTree.Identifier;
    name: string;
    injectFirstArg: string | null;
    injectOptions: InjectOptionFlags;
    usesAttributeDecorator: boolean;
    modifiers: string;
    unsupportedDecorator: boolean;
    unsafeForSuperField: boolean;
};

const ALLOWED_PARAM_DECORATORS = new Set(['Inject', 'Optional', 'Host', 'Self', 'SkipSelf', 'Attribute']);

function collectParamDecoratorFlags(
    decorators: TSESTree.Decorator[] | undefined,
    importMap: Map<string, ImportBinding>,
): {
    unsupported: boolean;
    flags: InjectOptionFlags;
    attributeStringArg: string | null;
    hasInject: boolean;
} {
    let unsupported = false;
    const flags: InjectOptionFlags = {};
    let attributeStringArg: string | null = null;
    let hasInject = false;

    for (const d of decorators ?? []) {
        const imported = getDecoratorImportedName(d, importMap);
        const expr = d.expression;

        if (imported === 'Inject') {
            hasInject = true;
            if (expr.type !== 'CallExpression' || !expr.arguments[0]) unsupported = true;
            continue;
        }

        if (!imported || !ALLOWED_PARAM_DECORATORS.has(imported)) {
            unsupported = true;
            continue;
        }

        switch (imported) {
            case 'Optional':
                flags.optional = true;
                break;
            case 'Host':
                flags.host = true;
                break;
            case 'Self':
                flags.self = true;
                break;
            case 'SkipSelf':
                flags.skipSelf = true;
                break;
            case 'Attribute':
                if (expr.type === 'CallExpression' && expr.arguments[0]?.type === 'Literal') {
                    const lit = expr.arguments[0] as TSESTree.Literal;
                    if (typeof lit.value === 'string') attributeStringArg = lit.value;
                    else unsupported = true;
                } else {
                    unsupported = true;
                }
                break;
            default:
                break;
        }
    }

    return { unsupported, flags, attributeStringArg, hasInject };
}

const PRIMITIVE_TYPE_KEYWORDS = new Set([
    'TSStringKeyword',
    'TSNumberKeyword',
    'TSBooleanKeyword',
    'TSBigIntKeyword',
    'TSSymbolKeyword',
    'TSAnyKeyword',
    'TSUnknownKeyword',
    'TSVoidKeyword',
    'TSNeverKeyword',
    'TSNullKeyword',
    'TSUndefinedKeyword',
]);

function hasNonPrimitiveTypeAnnotation(node: TSESTree.Identifier): boolean {
    const typeAnn = node.typeAnnotation;
    if (!typeAnn?.typeAnnotation) return false;
    return !PRIMITIVE_TYPE_KEYWORDS.has(typeAnn.typeAnnotation.type);
}

export function isDiConstructorParam(
    node: TSESTree.Node,
    importMap: Map<string, ImportBinding>,
): node is TSESTree.TSParameterProperty | TSESTree.Identifier {
    if (node.type === 'TSParameterProperty') return true;
    if (node.type === 'Identifier') {
        const decs = (node as TSESTree.Identifier & { decorators?: TSESTree.Decorator[] }).decorators;
        if (decs?.some((d) => getDecoratorImportedName(d, importMap) === 'Inject')) return true;
        if (hasNonPrimitiveTypeAnnotation(node)) return true;
    }
    return false;
}

export function getBindingFromParam(p: TSESTree.TSParameterProperty | TSESTree.Identifier): TSESTree.Identifier | null {
    if (p.type === 'TSParameterProperty') {
        const inner = p.parameter;
        if (inner.type === 'Identifier') return inner;
        if (inner.type === 'AssignmentPattern' && inner.left.type === 'Identifier') return inner.left;
        return null;
    }
    return p;
}

function paramName(p: TSESTree.TSParameterProperty | TSESTree.Identifier): string | null {
    const id = getBindingFromParam(p);
    return id?.name ?? null;
}

function formatModifiers(p: TSESTree.TSParameterProperty): string {
    const parts: string[] = [];
    if (p.accessibility) parts.push(p.accessibility);
    if (p.readonly) parts.push('readonly');
    return parts.join(' ');
}

function typeRefToInjectArg(
    typeAnn: TSESTree.TSTypeAnnotation | undefined,
    sourceCode: TSESLint.SourceCode,
): string | null {
    if (!typeAnn?.typeAnnotation) return null;
    const t = typeAnn.typeAnnotation;
    if (t.type === 'TSTypeReference' && t.typeName.type === 'Identifier') {
        return sourceCode.getText(t.typeName);
    }
    if (t.type === 'TSTypeReference' && t.typeName.type === 'TSQualifiedName') {
        return sourceCode.getText(t.typeName);
    }
    return null;
}

function injectTokenFromInjectDecorator(
    decorators: TSESTree.Decorator[] | undefined,
    importMap: Map<string, ImportBinding>,
    sourceCode: TSESLint.SourceCode,
): string | null {
    for (const d of decorators ?? []) {
        if (getDecoratorImportedName(d, importMap) !== 'Inject') continue;
        const expr = d.expression;
        if (expr.type !== 'CallExpression' || !expr.arguments[0]) return null;
        return sourceCode.getText(expr.arguments[0]);
    }
    return null;
}

function allDecoratorsOnParam(p: TSESTree.TSParameterProperty | TSESTree.Identifier): TSESTree.Decorator[] {
    if (p.type === 'TSParameterProperty') return p.decorators ?? [];
    return (p as TSESTree.Identifier & { decorators?: TSESTree.Decorator[] }).decorators ?? [];
}

function refIsWithinParamBinding(id: TSESTree.Identifier, binding: TSESTree.Identifier | null): boolean {
    if (!binding?.range || !id.range) return false;
    return id.range[0] >= binding.range[0] && id.range[1] <= binding.range[1];
}

export function analyzeDiParams(
    classNode: TSESTree.ClassDeclaration,
    ctor: TSESTree.MethodDefinition & { kind: 'constructor' },
    importMap: Map<string, ImportBinding>,
    sourceCode: TSESLint.SourceCode,
): DiParamAnalysis[] {
    const fn = ctor.value;
    if (fn.type !== 'FunctionExpression' || !fn.body) return [];

    const hasExtends = classNode.superClass != null;
    const parentMap = buildParentMap(fn.body);
    const firstSuper = hasExtends ? findFirstSuperCall(fn.body) : null;

    const scopeManager = sourceCode.scopeManager;
    const fnScope = scopeManager?.acquire(fn);
    const result: DiParamAnalysis[] = [];

    for (const param of fn.params) {
        if (!isDiConstructorParam(param, importMap)) continue;

        const name = paramName(param);
        if (!name) continue;

        const decs = allDecoratorsOnParam(param);
        const {
            unsupported: decUnsup,
            flags,
            attributeStringArg,
            hasInject,
        } = collectParamDecoratorFlags(decs, importMap);
        let unsupportedDecorator = decUnsup;

        const binding = getBindingFromParam(param);
        const typeAnn = binding?.typeAnnotation;

        const injectFromDecor = injectTokenFromInjectDecorator(decs, importMap, sourceCode);
        const usesAttributeDecorator = decs.some((d) => getDecoratorImportedName(d, importMap) === 'Attribute');

        if (binding?.optional) flags.optional = true;

        let injectFirstArg: string | null = null;
        if (usesAttributeDecorator && attributeStringArg !== null) {
            injectFirstArg = `new HostAttributeToken(${JSON.stringify(attributeStringArg)})`;
            if (hasInject) unsupportedDecorator = true;
        } else {
            injectFirstArg = injectFromDecor ?? typeRefToInjectArg(typeAnn, sourceCode);
        }

        if (!injectFirstArg) unsupportedDecorator = true;

        let unsafeForSuperField = false;
        if (firstSuper && fnScope) {
            const variable = fnScope.variables.find(
                (vi) => vi.name === name && vi.defs.some((def) => def.type === 'Parameter'),
            );
            if (variable) {
                for (const ref of variable.references) {
                    if (ref.identifier.type !== 'Identifier') continue;
                    if (refIsWithinParamBinding(ref.identifier, binding)) continue;
                    if (!ref.isRead()) continue;
                    if (isParamRefUnsafeForSuperField(ref.identifier, firstSuper, parentMap)) {
                        unsafeForSuperField = true;
                        break;
                    }
                }
            }
        }

        const modifiers = param.type === 'TSParameterProperty' ? formatModifiers(param) : 'private readonly';

        result.push({
            paramNode: param,
            name,
            injectFirstArg,
            injectOptions: flags,
            usesAttributeDecorator,
            modifiers,
            unsupportedDecorator,
            unsafeForSuperField,
        });
    }

    return result;
}

export function formatInjectOptions(flags: InjectOptionFlags): string | null {
    const entries: [string, boolean][] = [];
    if (flags.host) entries.push(['host', true]);
    if (flags.optional) entries.push(['optional', true]);
    if (flags.self) entries.push(['self', true]);
    if (flags.skipSelf) entries.push(['skipSelf', true]);
    if (!entries.length) return null;
    const inner = entries.map(([k, v]) => `${k}: ${v}`).join(', ');
    return `{ ${inner} }`;
}
