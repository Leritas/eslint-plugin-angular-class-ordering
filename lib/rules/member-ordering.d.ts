import { ESLintUtils } from '@typescript-eslint/utils';
export declare const RULE_NAME = "member-ordering";
export declare const DEFAULT_DECORATORS: readonly ["Component", "Directive", "Injectable", "Pipe"];
/** Built-in ordering slot keys matching Angular/class member shapes (before user patterns). */
export declare const DEFAULT_ORDER: readonly ["signature", "constructor", "inject", "input-signal", "input-decorator", "output-signal", "output-decorator", "model-signal", "host-binding-signal", "host-binding-decorator", "view-query-signal", "view-query-decorator", "content-query-signal", "content-query-decorator", "store-select-signal", "store-select-observable", "store-select-decorator", "signal", "linkedSignal", "computed", "public-static-field", "protected-static-field", "private-static-field", "public-instance-field", "protected-instance-field", "private-instance-field", "public-static-method", "protected-static-method", "private-static-method", "public-instance-method", "protected-instance-method", "private-instance-method"];
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
export declare const messages: {
    wrongOrder: string;
    unknownCategory: string;
};
export declare const rule: ESLintUtils.RuleModule<"wrongOrder" | "unknownCategory", [{
    decorators: ("Component" | "Directive" | "Injectable" | "Pipe")[];
    order: ("signature" | "constructor" | "inject" | "input-signal" | "input-decorator" | "output-signal" | "output-decorator" | "model-signal" | "host-binding-signal" | "host-binding-decorator" | "view-query-signal" | "view-query-decorator" | "content-query-signal" | "content-query-decorator" | "store-select-signal" | "store-select-observable" | "store-select-decorator" | "signal" | "linkedSignal" | "computed" | "public-static-field" | "protected-static-field" | "private-static-field" | "public-instance-field" | "protected-instance-field" | "private-instance-field" | "public-static-method" | "protected-static-method" | "private-static-method" | "public-instance-method" | "protected-instance-method" | "private-instance-method")[];
    unknownPlacement: "last";
}], unknown, ESLintUtils.RuleListener> & {
    name: string;
};
//# sourceMappingURL=member-ordering.d.ts.map