import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
export declare const ANGULAR_CORE = "@angular/core";
export declare const DEFAULT_INJECT_RULE_DECORATORS: readonly ["Component", "Directive", "Injectable", "Pipe"];
export type ImportBinding = {
    module: string;
    importedName: string;
};
export declare function buildImportMap(programNode: TSESTree.Program): Map<string, ImportBinding>;
export declare function iterateClasses(programNode: TSESTree.Program): Generator<TSESTree.ClassDeclaration>;
export declare function getDecoratorNames(decorators: TSESTree.Decorator[] | undefined): string[];
export declare function classMatchesDecorators(classNode: TSESTree.ClassDeclaration, decoratorNames: readonly string[]): boolean;
export declare function getDecoratorImportedName(dec: TSESTree.Decorator, importMap: Map<string, ImportBinding>): string | null;
/** Build parent pointers for subtree (no AST mutation). */
export declare function buildParentMap(root: TSESTree.Node): Map<TSESTree.Node, TSESTree.Node | null>;
export declare function findConstructor(classBody: TSESTree.ClassBody): (TSESTree.MethodDefinition & {
    kind: 'constructor';
}) | null;
export declare function findFirstSuperCall(body: TSESTree.BlockStatement): TSESTree.CallExpression | null;
/**
 * Whether a reference to a constructor parameter must stay in the constructor
 * (cannot become a field initializer) due to `super()` ordering.
 */
export declare function isParamRefUnsafeForSuperField(refIdentifier: TSESTree.Identifier, firstSuper: TSESTree.CallExpression, parentMap: Map<TSESTree.Node, TSESTree.Node | null>): boolean;
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
export declare function isDiConstructorParam(node: TSESTree.Node, importMap: Map<string, ImportBinding>): node is TSESTree.TSParameterProperty | TSESTree.Identifier;
export declare function getBindingFromParam(p: TSESTree.TSParameterProperty | TSESTree.Identifier): TSESTree.Identifier | null;
export declare function analyzeDiParams(classNode: TSESTree.ClassDeclaration, ctor: TSESTree.MethodDefinition & {
    kind: 'constructor';
}, importMap: Map<string, ImportBinding>, sourceCode: TSESLint.SourceCode): DiParamAnalysis[];
export declare function formatInjectOptions(flags: InjectOptionFlags): string | null;
//# sourceMappingURL=injection-context.utils.d.ts.map