# `member-ordering`

Enforces a consistent, Angular-aware order for class members in classes decorated with Angular decorators (by default: `Component`, `Directive`, `Injectable`, `Pipe`).

The rule classifies members using:

- `@angular/core` APIs resolved via imports (local aliases like `inject as inj` resolve by **imported** symbol name — `inj()` still counts as `inject`)
- Common Angular decorators (`@Input`, `@ViewChild`, `@HostBinding`, `@HostListener`, …)
- Dedicated slots for `get`/`set` accessors (`getter-setter`), abstract members (`abstract`), and visibility buckets (`public-instance-field`, `public-instance-method`, …)
- **Overlay** entries in `order`: regex (`regex:` shorthand or `{ type: "pattern" }`), plus optional `custom-func-*` / `custom-dec-*` matchers (see below)

## Rule details

- **Type**: layout
- **Fixable**: yes (code)

## Options

This rule accepts a single options object.

### `decorators`

Class-level decorator names that activate the rule for a given class.

- Type: `string[]`
- Default: `["Component", "Directive", "Injectable", "Pipe"]`

### `order`

Fully ordered list of slot entries. Important:

- When you omit this option entirely, you get the plugin’s **`DEFAULT_ORDER`**.
- When you supply `order`, you must list **every** slot you care about yourself — **it replaces the entire default**, it is **not merged**. If you omit a tier (for example leave out `inject`), injection fields may drop to `unknownPlacement` behaviour.

Each entry may be:

| Form                                            | Behaviour                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Category string**                             | Built-in Angular or modifier buckets (same identifiers as [`DEFAULT_ORDER`](../../src/rules/member-ordering.ts#L12))                                                                                                                                                                                                       |
| **Object** `{ type: "pattern", regex, flags? }` | Matches the **whole source text** of the member (modifiers, decorators, name, initializer, etc.). Prefer this when you need flags or `: ` inside the regexp body.                                                                                                                                                          |
| **`regex:`** + pattern body                     | Same as `{ type:"pattern", regex: … }`. Only the substring **after** the first `regex:` is the regexp; for patterns that need `:` inside the body itself, use the object form `{ type:"pattern", regex: "..." }`.                                                                                                          |
| **`custom-func-`**`Foo` **(whole string)**      | Matches if initializer (field) or function body/method (`method`) contains a nested call whose callee is **`Foo`** (`Foo()`) **or** a non-computed **`?.Foo()`**/`obj.Foo`-style callee with property name **`Foo`** — any module, purely structural. Multiple overlays: **earliest** matching slot index in `order` wins. |
| **`custom-dec-`**`X` **(whole string)**         | Matches a member decorated with `@X(...)` when `X` is **not** one of Angular’s built-in classifications above. Must match exactly `custom-dec-<Identifier>` (full string) so unrelated names like `custom-decoration` are not treated as overlays unless that is the intended decorator suffix.                            |

**Overlay vs modifier buckets:** after Angular-aware classification stops, modifiers would normally map to things like `public-instance-field`. If an **overlay** entry (pattern, `regex:`, custom-func/dec) matches and that entry appears earlier in `order`, the member sorts into **that overlay slot** instead — so patterns can carve out sub-groups between `signal` and `linkedSignal`, etc.

If several overlays match, the **minimum index among them** in `order` wins.

### `unknownPlacement`

Members that don’t resolve to anything in `order` (no modifier bucket listed, non-matching overlays).

- `"last"` (default): ranks after configured slots when sorting
- `"ignore"`: skip ordering lint for unmatched members only
- `"error"`: report `unknownCategory`; disables auto-fix if any unmatched member remains

## Categories (default full list — copy when customizing `order`)

| Slot                                                                         | Meaning                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `constructor`                                                                | Constructor                                          |
| `inject`                                                                     | `inject(...)` (including import aliases `as`)        |
| `input-signal` / `output-signal` / `model-signal`                            | Signal-based inputs/outputs/model                    |
| `input-decorator` / `output-decorator`                                       | `@Input()` / `@Output()`                             |
| `host-binding-signal`                                                        | `hostBinding(...)` fields                            |
| `host-binding-decorator`                                                     | `@HostBinding(...)`                                  |
| `host-listener-signal`                                                       | `hostListener(...)` fields                           |
| `host-listener-decorator`                                                    | `@HostListener(...)`                                 |
| `view-query-signal` / `view-query-decorator`                                 | `viewChild` / `@ViewChild`                           |
| `content-query-signal` / `content-query-decorator`                           | `contentChild` / `@ContentChild`                     |
| `store-select-signal` / `store-select-observable` / `store-select-decorator` | NgRx-style `.selectSignal` / `.select` / `@Select()` |
| `signal` / `linkedSignal` / `computed`                                       | Core `signal`, `linkedSignal`, `computed`            |
| `public-*-field` / … / `private-*-field`                                     | Ordinary fields by visibility                        |
| `getter-setter`                                                              | Concrete `get` / `set` accessors (pairing preserved) |
| `abstract`                                                                   | `abstract` methods and abstract accessors            |
| `public-*-method` / … / `private-*-method`                                   | Ordinary methods by visibility                       |

Getter/setter pairs share one category (`getter-setter`); the setter rank is pinned to the getter.

Private `#field` identifiers still classify into `private-instance-field`.

## Lint messages (`wrongOrder`)

Violations summarise **readable slot labels** and a **narrow slice** of `order` (a few neighbouring groups) rather than dumping the entire configuration.

## Limits & caveats

- **Namespace Angular imports**: `import * as core … core.signal(...)` isn't matched by `@angular/core` symbol resolution unless extended later — prefer normal named imports when using this rule.
- **Huge classes / deeply nested overlays**: autofix reshuffles verbatim source chunks; rerun Prettier/formatters afterward if needed.

## Fixer behaviour

Moves members wholesale with leading comments intact; newline gaps follow pragmatic heuristics (constructor fences, accessor pairs, categories).

## Requirements

Lint **TypeScript** with **`@typescript-eslint/parser`** (decorators, types, signals).

---

## Full example: every default slot (before and after `--fix`)

The first block is deliberately **shuffled** — it includes one member for each category in [`DEFAULT_ORDER`](../../src/rules/member-ordering.ts) (constructor through visibility methods, plus `getter-setter` and `abstract`), and a tiny NgRx-shaped `store`/`selectSignal`/`select` demo. The second block is the exact result of this rule’s autofix (spacing follows the built-in gap heuristics).

> **Note:** The `store` field is ordered after `selectSignal`/`select` fields here only so the example fits the default slot list; at runtime you would normally inject a store or declare `store` above those members. Treat this as an illustration of **lint ordering**, not Angular data-flow.

**Before (chaos):**

```ts
import {
    Component,
    EventEmitter,
    Output,
    Input,
    inject,
    input,
    output,
    model,
    signal,
    linkedSignal,
    computed,
    viewChild,
    viewChildren,
    contentChild,
    contentChildren,
    hostBinding,
    hostListener,
    ViewChild,
    ViewChildren,
    ContentChild,
    ContentChildren,
    HostBinding,
    HostListener,
    ElementRef,
} from '@angular/core';

declare function Select(...args: unknown[]): PropertyDecorator;

@Component({ selector: 'app-kitchen-sink', template: '' })
export abstract class KitchenSink {
    private privInstM(): void {}

    public static pubStaticF = 1;

    @Output() outDec = new EventEmitter<void>();

    readonly modelField = model('');

    protected protInstF = 1;

    abstract absMethod(): void;

    readonly scrollHost = hostListener('window:scroll', () => {});

    @HostListener('window:resize')
    onResize(): void {}

    readonly inSig = input('');

    @Input() inDec = '';

    private static privStaticM(): void {}

    readonly outSig = output<void>();

    @ViewChild('refA') viewDec?: ElementRef;

    public pubInstM(): void {}

    constructor() {}

    private privInstF = 2;

    readonly baseSig = signal(0);

    @ContentChildren('q') contentDecList?: unknown;

    @Select() slice$ = {} as unknown;

    store = { selectSignal: () => signal(0), select: () => ({}) };

    readonly fromObs = this.store.select(() => ({}));

    readonly fromSig = this.store.selectSignal(() => 0);

    @HostBinding('class.active') hostBindDec = true;

    readonly hostBindSig = hostBinding('attr.data-x');

    readonly contentSig = contentChild('slotB');

    @ContentChild('slotB') contentDec?: unknown;

    readonly viewSig = viewChild<ElementRef>('refA');

    @ViewChildren('items') viewDecList?: unknown;

    readonly viewSigMulti = viewChildren('items');

    readonly contentSigMulti = contentChildren('q');

    readonly linked = linkedSignal(() => this.baseSig());

    readonly derived = computed(() => this.baseSig() + 1);

    private readonly injected = inject(ElementRef);

    public pubInstF = 3;

    protected protInstM(): void {}

    protected static protStaticM(): void {}

    public static pubStaticM(): void {}

    private static privStaticF = 2;

    protected static protStaticF = 3;

    private _pair = 0;

    get paired(): number {
        return this._pair;
    }

    set paired(v: number) {
        this._pair = v;
    }
}
```

**After (same class, default `order`, ESLint `--fix`):**

```ts
import {
    Component,
    EventEmitter,
    Output,
    Input,
    inject,
    input,
    output,
    model,
    signal,
    linkedSignal,
    computed,
    viewChild,
    viewChildren,
    contentChild,
    contentChildren,
    hostBinding,
    hostListener,
    ViewChild,
    ViewChildren,
    ContentChild,
    ContentChildren,
    HostBinding,
    HostListener,
    ElementRef,
} from '@angular/core';

declare function Select(...args: unknown[]): PropertyDecorator;

@Component({ selector: 'app-kitchen-sink', template: '' })
export abstract class KitchenSink {
    constructor() {}

    private readonly injected = inject(ElementRef);

    readonly inSig = input('');

    @Input() inDec = '';

    readonly outSig = output<void>();

    @Output() outDec = new EventEmitter<void>();

    readonly modelField = model('');

    readonly hostBindSig = hostBinding('attr.data-x');

    @HostBinding('class.active') hostBindDec = true;

    readonly scrollHost = hostListener('window:scroll', () => {});

    @HostListener('window:resize')
    onResize(): void {}

    readonly viewSig = viewChild<ElementRef>('refA');
    readonly viewSigMulti = viewChildren('items');

    @ViewChild('refA') viewDec?: ElementRef;
    @ViewChildren('items') viewDecList?: unknown;

    readonly contentSig = contentChild('slotB');
    readonly contentSigMulti = contentChildren('q');

    @ContentChildren('q') contentDecList?: unknown;
    @ContentChild('slotB') contentDec?: unknown;

    readonly fromSig = this.store.selectSignal(() => 0);

    readonly fromObs = this.store.select(() => ({}));

    @Select() slice$ = {} as unknown;

    readonly baseSig = signal(0);

    readonly linked = linkedSignal(() => this.baseSig());

    readonly derived = computed(() => this.baseSig() + 1);

    public static pubStaticF = 1;

    protected static protStaticF = 3;

    private static privStaticF = 2;

    store = { selectSignal: () => signal(0), select: () => ({}) };
    public pubInstF = 3;

    protected protInstF = 1;

    private privInstF = 2;
    private _pair = 0;

    get paired(): number {
        return this._pair;
    }
    set paired(v: number) {
        this._pair = v;
    }

    abstract absMethod(): void;

    public static pubStaticM(): void {}

    protected static protStaticM(): void {}

    private static privStaticM(): void {}

    public pubInstM(): void {}

    protected protInstM(): void {}

    private privInstM(): void {}
}
```
