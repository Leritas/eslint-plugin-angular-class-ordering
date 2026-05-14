# `member-ordering`

Enforces a consistent, Angular-aware order for class members in classes decorated with Angular decorators (by default: `Component`, `Directive`, `Injectable`, `Pipe`).

The plugin’s **`recommended`** preset turns **only** this rule on (at `error`). [`prefer-inject-function`](./prefer-inject-function.md) and [`forbid-nested-super-injections`](./forbid-nested-super-injections.md) are separate, opt-in rules in the same package.

**Quick navigation:** [Custom `order` replaces defaults](#recipe-custom-order-replaces-defaults) · [unknownPlacement](#unknownplacement) · [readonlyOrdering](#readonlyordering) · [Custom `decorators`](#recipe-custom-decorators) · [Regex overlay slot](#recipe-regex-overlay-slot) · [`custom-func-` overlay](#recipe-custom-func--overlay-slot) · [`custom-dec-` overlay](#recipe-custom-dec--overlay-slot) · [Full default-order example](#full-example-every-default-slot-before-and-after-fix)

## What gets checked

The rule classifies each member using:

- `@angular/core` APIs resolved via imports (local aliases like `inject as inj` resolve by **imported** symbol name — `inj()` still counts as `inject`)
- Common Angular decorators (`@Input`, `@ViewChild`, `@HostBinding`, `@HostListener`, …)
- Dedicated slots for `get`/`set` accessors (`getter-setter`), abstract members (`abstract`), and visibility buckets (`public-instance-field`, `public-instance-method`, …)
- **Overlay** entries in `order`: regex (`regex:` shorthand or `{ type: "pattern" }`), plus optional `custom-func-*` / `custom-dec-*` matchers (see [Options](#order))
- **Readonly vs mutable in one slot:** with the default options, **`readonly` fields are sorted above non-readonly** in the same category (for example both in `public-instance-field`). Turn that off with [`readonlyOrdering: false`](#readonlyordering) so declaration order is preserved for that pairing only.

It reports members that are out of rank relative to your configured `order` (and optionally unmatched categories when `unknownPlacement` is `"error"`).

## Interaction with `prefer-inject-function`

[`prefer-inject-function`](./prefer-inject-function.md) moves constructor DI into `inject()` fields. With the **default** `order`, those fields belong in the **`inject`** tier immediately after the constructor. Run both rules together if you want a consistent end state: DI as fields, then ordered with the rest of the class.

## Rule details

- **Type**: layout
- **Fixable**: yes (code)
- **Readonly ordering (default):** `readonlyOrdering` defaults to **`true`**, so **`readonly` class fields come before non-readonly fields** when they share the same ordering slot. Set **`readonlyOrdering: false`** to disable that sub-sort and keep the author’s source order within the slot. Details: [readonlyOrdering](#readonlyordering).

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

### `readonlyOrdering`

**Default: `true` — `readonly` fields are ordered first** within a single ordering slot (for example two members both in `public-instance-field`). Set to **`false`** only when you need to preserve declaration order between `readonly` and mutable fields in that slot (for example field initializers that depend on that order).

- Type: `boolean`
- **`true` (default)**: `readonly` members get a slightly lower fractional rank so they sort first; **`--fix`** reorders accordingly. When spacing falls through to the same-category branch, the fixer inserts an **extra blank line** when leaving a `readonly` field run and entering a non-readonly field in that slot (visual subgroup).
- **`false`**: no readonly modifier on ranks — only slot index plus declaration-order tie-breakers — so **declaration order is preserved** within the slot. Use this when you rely on field initializer order across mutable vs `readonly` members and do not want the rule to rewrite that.

This does **not** change ordering **across** slots (for example `inject` vs `public-instance-field`); it only affects members that share the same resolved category.

## Categories (default full list — copy when customizing `order`)

| Slot                                                                                              | Meaning                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `constructor`                                                                                     | Constructor                                                                           |
| `inject`                                                                                          | `inject(...)` (including import aliases `as`)                                         |
| `input-signal` / `output-signal` / `model-signal`                                                 | Signal-based inputs/outputs/model                                                     |
| `input-decorator` / `output-decorator`                                                            | `@Input()` / `@Output()`                                                              |
| `host-binding-signal`                                                                             | `hostBinding(...)` fields                                                             |
| `host-binding-decorator`                                                                          | `@HostBinding(...)`                                                                   |
| `host-listener-signal`                                                                            | `hostListener(...)` fields                                                            |
| `host-listener-decorator`                                                                         | `@HostListener(...)`                                                                  |
| `view-query-signal` / `view-query-decorator`                                                      | `viewChild` / `@ViewChild`                                                            |
| `content-query-signal` / `content-query-decorator`                                                | `contentChild` / `@ContentChild`                                                      |
| `store-select-map` / `store-select-signal` / `store-select-observable` / `store-select-decorator` | NGXS `createSelectMap` from `@ngxs/store` / `.selectSignal` / `.select` / `@Select()` |
| `signal` / `linkedSignal` / `computed`                                                            | Core `signal`, `linkedSignal`, `computed`                                             |
| `public-*-field` / … / `private-*-field`                                                          | Ordinary fields by visibility                                                         |
| `getter-setter`                                                                                   | Concrete `get` / `set` accessors (pairing preserved)                                  |
| `abstract`                                                                                        | `abstract` methods and abstract accessors                                             |
| `public-*-method` / … / `private-*-method`                                                        | Ordinary methods by visibility                                                        |

Getter/setter pairs share one category (`getter-setter`); the setter rank is pinned to the getter.

Private `#field` identifiers still classify into `private-instance-field`.

## Examples

### Recipe: custom `order` replaces defaults

If you set `order`, it **replaces** the entire built-in [`DEFAULT_ORDER`](../../src/rules/member-ordering.ts) — nothing is merged in. If you **omit** a tier such as `inject`, members that still classify as `inject` (for example `private readonly svc = inject(Foo)`) become **unmatched** and follow [`unknownPlacement`](#unknownplacement) (by default they sort **last**).

Options (fragment):

```javascript
{
  order: ['constructor', 'public-instance-field'],
}
```

**Before (violates order — `inject` field before constructor):**

```ts
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    constructor() {}

    plain = 1;
}
```

**After `eslint --fix`:** constructor first, then `plain`; the `inject()` field is **unknown** relative to this short `order` and is sorted **last** (default `unknownPlacement: 'last'`).

```ts
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    constructor() {}

    plain = 1;

    private readonly svc = inject(Foo);
}
```

### Recipe: `unknownPlacement`

Members whose category is **not** listed in `order` are “unknown”. The option controls what happens to them:

| Value      | Behaviour                                                                           |
| ---------- | ----------------------------------------------------------------------------------- |
| `"last"`   | Sort them after all configured slots (default).                                     |
| `"ignore"` | Do not lint ordering for those members only.                                        |
| `"error"`  | Report `unknownCategory`; if any unknown remains, **`wrongOrder` has no auto-fix**. |

**`ignore`** — only `inject` is in `order`; `extra` is skipped for ordering (valid code):

```ts
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    extra = 1;
}
```

```javascript
// options
{ unknownPlacement: 'ignore', order: ['inject'] }
```

**`error` + unresolved unknown blocks fixing other violations** — constructor is out of order relative to `inject`, and `extra` is unknown; auto-fix is disabled (`output: null` in tests):

```ts
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    constructor() {}

    extra = 1;
}
```

```javascript
{ unknownPlacement: 'error', order: ['constructor', 'inject'] }
```

### Recipe: custom `decorators`

By default the rule activates on classes decorated with `@Component`, `@Directive`, `@Injectable`, or `@Pipe`. You can narrow (or widen) this list with the `decorators` option. Classes whose decorator is **not** in the list are silently skipped — no ordering is enforced on them.

Here only `@Pipe` classes are linted; the `@Component` class is **ignored** even though its members are out of order:

```ts
import { Component, Pipe, inject } from '@angular/core';

class Foo {}

@Pipe({ name: 'test' })
export class P {
    private readonly svc = inject(Foo);
}

@Component({ selector: 'app-x', template: '' })
export class NotLinted {
    plain = 1;

    other = 2;
}
```

```javascript
{
  decorators: ['Pipe'],
}
```

### Recipe: regex overlay slot

A pattern overlay can pull specific fields **between** built-in tiers. Here `legacyTracked` is matched by `{ type: 'pattern', regex: 'legacyTracked' }` and must sit **after** `inject` but **before** other `public-instance-field` members.

**Before:**

```ts
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    plain = 1;

    legacyTracked = true;
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    legacyTracked = true;

    plain = 1;
}
```

```javascript
// object form (supports `flags` and `:` inside the body)
{
  order: ['inject', { type: 'pattern', regex: 'legacyTracked' }, 'public-instance-field'],
}

// equivalent `regex:` shorthand (shorter, but no `flags` and `:` in the body is ambiguous)
{
  order: ['inject', 'regex:legacyTracked', 'public-instance-field'],
}
```

### Recipe: `custom-func-` overlay slot

`custom-func-Foo` matches any member whose initializer (field) or body (method) contains a call to `Foo(...)` — including member-expression forms like `obj.Foo(...)`. This lets you carve out a dedicated tier for wrapper helpers that aren't part of Angular's built-in classification.

Here a `boxedSignal` helper wraps a signal; we want those fields to sit **between** `signal` and `linkedSignal`.

**Before (violates order — `boxedSignal` field after `linkedSignal`):**

```ts
import { Component, signal, linkedSignal } from '@angular/core';

declare function boxedSignal<T>(v: T): T;

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly plainSig = signal(0);

    readonly linked = linkedSignal(() => this.plainSig());

    readonly wrapped = boxedSignal(1);
}
```

**After `eslint --fix`:**

```ts
import { Component, signal, linkedSignal } from '@angular/core';

declare function boxedSignal<T>(v: T): T;

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly plainSig = signal(0);

    readonly wrapped = boxedSignal(1);

    readonly linked = linkedSignal(() => this.plainSig());
}
```

```javascript
{
  order: ['signal', 'custom-func-boxedSignal', 'linkedSignal', 'computed', 'public-instance-field'],
}
```

### Recipe: `custom-dec-` overlay slot

`custom-dec-X` matches any member decorated with `@X(...)` when `X` is **not** one of the built-in Angular decorator classifications (like `@Input`, `@HostBinding`, etc.). This is useful for project-specific or third-party decorators.

Here a `@Track()` decorator marks telemetry fields; we want them **before** ordinary public fields.

**Before (violates order — `@Track()` field after ordinary field):**

```ts
import { Component } from '@angular/core';

declare function Track(opts?: unknown): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    plain = 1;

    @Track() trackedVal = true;
}
```

**After `eslint --fix`:**

```ts
import { Component } from '@angular/core';

declare function Track(opts?: unknown): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    @Track() trackedVal = true;

    plain = 1;
}
```

```javascript
{
  order: ['constructor', 'custom-dec-Track', 'public-instance-field'],
}
```

---

## Full example: every default slot (before and after fix)

The first block is deliberately **shuffled** — it includes one member for each category in [`DEFAULT_ORDER`](../../src/rules/member-ordering.ts) (constructor through visibility methods, plus `getter-setter` and `abstract`), plus NgRx-style `inject(Store)` with `.selectSignal` / `.select`, NGXS `createSelectMap` from `@ngxs/store` (`store-select-map`), and `@Select()`. The second block is the exact result of ESLint **`--fix`** (spacing follows the built-in gap heuristics).

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
import { createSelectMap } from '@ngxs/store';

declare function Select(...args: unknown[]): PropertyDecorator;

/** NgRx-like store surface for the demo only (types are intentionally loose). */
declare class Store {
    selectSignal<T>(projector: () => T): unknown;
    select(projector: () => unknown): unknown;
}

/** Stand-in selector refs for NGXS createSelectMap demo (types are loose). */
declare const SliceSelectors: { alpha: unknown; beta: unknown };

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

    readonly fromObs = this.store.select(() => ({}));

    readonly fromSig = this.store.selectSignal(() => 0);

    readonly selectMapBundle = createSelectMap({
        alpha: SliceSelectors.alpha,
        beta: SliceSelectors.beta,
    });

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
    private readonly store = inject(Store);

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
import { createSelectMap } from '@ngxs/store';

declare function Select(...args: unknown[]): PropertyDecorator;

/** NgRx-like store surface for the demo only (types are intentionally loose). */
declare class Store {
    selectSignal<T>(projector: () => T): unknown;
    select(projector: () => unknown): unknown;
}

/** Stand-in selector refs for NGXS createSelectMap demo (types are loose). */
declare const SliceSelectors: { alpha: unknown; beta: unknown };

@Component({ selector: 'app-kitchen-sink', template: '' })
export abstract class KitchenSink {
    constructor() {}

    private readonly injected = inject(ElementRef);
    private readonly store = inject(Store);

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

    readonly selectMapBundle = createSelectMap({
        alpha: SliceSelectors.alpha,
        beta: SliceSelectors.beta,
    });

    readonly fromSig = this.store.selectSignal(() => 0);

    readonly fromObs = this.store.select(() => ({}));

    @Select() slice$ = {} as unknown;

    readonly baseSig = signal(0);

    readonly linked = linkedSignal(() => this.baseSig());

    readonly derived = computed(() => this.baseSig() + 1);

    public static pubStaticF = 1;

    protected static protStaticF = 3;

    private static privStaticF = 2;

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

## Lint messages (`wrongOrder`)

Violations summarise **readable slot labels** and a **narrow slice** of `order` (a few neighbouring groups) rather than dumping the entire configuration.

## Fixer behaviour

Moves members wholesale with leading comments intact; newline gaps follow pragmatic heuristics (constructor fences, accessor pairs, categories).

**JSDoc / comments:** Each member’s slice starts at the first **leading** comment ESLint attaches to that node (`getCommentsBefore`) and includes trailing line/block comments before the next member when they belong to the same chunk. Block comments such as `/** … */` therefore **travel with the member** when it is reordered (see tests). After `--fix`, run your formatter (e.g. Prettier) on large edits so spacing matches team style.

**Residual risk:** Trivia that is not associated by the parser with any class member (unusual placement) may not move as you expect; the rule is conservative text-splicing, not a full pretty-printer.

## Limits & caveats

- **Namespace Angular imports**: `import * as core … core.signal(...)` isn't matched by `@angular/core` symbol resolution unless extended later — prefer normal named imports when using this rule.
- **Huge classes / deeply nested overlays**: autofix reshuffles verbatim source chunks; rerun Prettier/formatters afterward if needed.
- **`inject()` not from `@angular/core`**: a call named `inject` that is **not** that imported symbol (e.g. a local helper) is classified as an ordinary field, not the `inject` slot.
- **Nested `inject` calls**: a field whose initializer is not a direct `inject(...)` call (for example a **ternary** at the root) is not given the `inject` slot unless `exprContainsCall` reaches it; today a ternary with `inject` in both branches is treated like a normal instance field.

## Requirements

Lint **TypeScript** with **`@typescript-eslint/parser`** (decorators, types, signals).

---

## Config examples

### Flat config (`recommended` preset)

`configs.recommended` includes **`member-ordering`** only. Pair it with the inject rules manually if you need them (see the [README](../../README.md)).

```javascript
rules: {
  ...angularClassOrdering.configs.recommended.rules,
},
```

### Custom `order` with overlay

```javascript
rules: {
  'angular-class-ordering/member-ordering': [
    'error',
    {
      order: ['inject', { type: 'pattern', regex: 'legacyTracked' }, 'public-instance-field'],
    },
  ],
},
```
