"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rule = exports.forbidNestedMessages = exports.RULE_NAME = void 0;
const utils_1 = require("@typescript-eslint/utils");
const injection_context_utils_1 = require("./injection-context.utils");
exports.RULE_NAME = 'forbid-nested-super-injections';
const createRule = utils_1.ESLintUtils.RuleCreator((name) => `https://github.com/Leritas/eslint-plugin-angular-class-ordering/blob/main/docs/rules/${name}.md`);
exports.forbidNestedMessages = {
    forbidNestedSuperInjections: 'Constructor dependency `{{name}}` is used before subclass `inject()` fields exist (e.g. in `super(...)` or earlier code). Refactor the base class to stop passing this through `super`, for example by using `inject()` on the parent; then `prefer-inject-function` can move it safely.',
};
exports.rule = createRule({
    name: exports.RULE_NAME,
    meta: {
        type: 'problem',
        docs: {
            description: 'Flags constructor DI parameters that cannot be migrated to `inject()` because they are used before `super()` completes.',
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
        messages: exports.forbidNestedMessages,
    },
    defaultOptions: [
        {
            decorators: [...injection_context_utils_1.DEFAULT_INJECT_RULE_DECORATORS],
        },
    ],
    create(context, [options = {}]) {
        const decorators = options.decorators ?? [...injection_context_utils_1.DEFAULT_INJECT_RULE_DECORATORS];
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
                    for (const a of analyses) {
                        if (!a.unsafeForSuperField)
                            continue;
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
//# sourceMappingURL=forbid-nested-super-injections.js.map