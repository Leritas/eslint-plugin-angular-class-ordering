import { ESLintUtils } from '@typescript-eslint/utils';
export declare const RULE_NAME = "forbid-nested-super-injections";
export type ForbidNestedMessageIds = 'forbidNestedSuperInjections';
export declare const forbidNestedMessages: {
    forbidNestedSuperInjections: string;
};
type RuleOptions = {
    decorators?: string[];
};
type OptionsTuple = [RuleOptions?];
export declare const rule: ESLintUtils.RuleModule<"forbidNestedSuperInjections", OptionsTuple, unknown, ESLintUtils.RuleListener> & {
    name: string;
};
export {};
//# sourceMappingURL=forbid-nested-super-injections.d.ts.map