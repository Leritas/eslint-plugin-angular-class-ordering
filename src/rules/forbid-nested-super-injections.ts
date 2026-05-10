import { ESLintUtils } from '@typescript-eslint/utils';

import {
    analyzeDiParams,
    buildImportMap,
    classMatchesDecorators,
    DEFAULT_INJECT_RULE_DECORATORS,
    findConstructor,
    iterateClasses,
} from './injection-context.utils';

export const RULE_NAME = 'forbid-nested-super-injections';

const createRule = ESLintUtils.RuleCreator(
    (name) => `https://github.com/Leritas/eslint-plugin-angular-class-ordering/blob/main/docs/rules/${name}.md`,
);

export type ForbidNestedMessageIds = 'forbidNestedSuperInjections';

export const forbidNestedMessages = {
    forbidNestedSuperInjections:
        'Constructor dependency `{{name}}` is used before subclass `inject()` fields exist (e.g. in `super(...)` or earlier code). Refactor the base class to stop passing this through `super`, for example by using `inject()` on the parent; then `prefer-inject-function` can move it safely.',
} satisfies Record<ForbidNestedMessageIds, string>;

type RuleOptions = {
    decorators?: string[];
};

type OptionsTuple = [RuleOptions?];

export const rule = createRule<OptionsTuple, ForbidNestedMessageIds>({
    name: RULE_NAME,
    meta: {
        type: 'problem',
        docs: {
            description:
                'Flags constructor DI parameters that cannot be migrated to `inject()` because they are used before `super()` completes.',
        },
        schema: [
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    decorators: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
            },
        ],
        messages: forbidNestedMessages,
    },
    defaultOptions: [
        {
            decorators: [...DEFAULT_INJECT_RULE_DECORATORS],
        },
    ],
    create(context, [options = {}]) {
        const decorators = options.decorators ?? [...DEFAULT_INJECT_RULE_DECORATORS];
        const sourceCode = context.sourceCode;
        const program = sourceCode.ast as import('@typescript-eslint/utils').TSESTree.Program;
        const importMap = buildImportMap(program);

        return {
            Program() {
                for (const classNode of iterateClasses(program)) {
                    if (!classMatchesDecorators(classNode, decorators)) continue;
                    const ctor = findConstructor(classNode.body);
                    if (!ctor) continue;

                    const analyses = analyzeDiParams(classNode, ctor, importMap, sourceCode);
                    for (const a of analyses) {
                        if (!a.unsafeForSuperField) continue;
                        context.report({
                            node: a.paramNode,
                            messageId: 'forbidNestedSuperInjections',
                            data: { name: a.name },
                        });
                    }
                }
            },
        };
    },
});
