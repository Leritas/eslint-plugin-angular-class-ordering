import type { TSESLint } from '@typescript-eslint/utils';
export declare const RULE_NAME = "prefer-inject-function";
export type PreferInjectMessageIds = 'preferInject';
export declare const preferInjectMessages: {
    preferInject: string;
};
type RuleOptions = {
    decorators?: string[];
    /** When `false`, never emit fixes. Default `true`. */
    autofix?: boolean;
};
type OptionsTuple = [RuleOptions?];
export declare const rule: TSESLint.RuleModule<"preferInject", OptionsTuple, unknown, TSESLint.RuleListener> & {
    name: string;
};
export {};
//# sourceMappingURL=prefer-inject-function.d.ts.map