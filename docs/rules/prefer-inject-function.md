# `prefer-inject-function`

Suggests using Angular’s **`inject()`** for dependency-injected constructor parameters on classes that carry Angular’s class-level decorators, and can rewrite them in one batch per constructor when auto-fix is allowed.

The plugin’s **`recommended`** preset does **not** enable this rule (only [`member-ordering`](./member-ordering.md) is on by default). Turn it on in ESLint when you want constructor → `inject()` migrations; consider enabling [`forbid-nested-super-injections`](./forbid-nested-super-injections.md) alongside it for subclass `super()` safety.

**Quick navigation:** [Examples](#examples) · [Decorator mapping](#decorator-mapping-to-inject) · [Fixer walkthrough](#fixer-walkthrough-with-examples) · [Config](#config-examples)

## What gets flagged

The rule reports:

- **Parameter properties** — `constructor(private readonly store: Store)` (any `public` / `protected` / `private`, with or without `readonly`, optional `?` on the binding).
- **Parameters with `@Inject(...)` from `@angular/core`** — including `constructor(@Inject(TOKEN) foo: Foo)` with no access modifier (the fix emits a **`private readonly`** field).
- **Bare typed parameters with non-primitive type annotations** — `constructor(router: Router)` without any modifier or decorator. Angular injects these via DI just like parameter properties. The fix emits a **`private readonly`** field.

**Not flagged:**

- Parameters with **primitive** type annotations (`string`, `number`, `boolean`, `bigint`, `symbol`, `any`, `unknown`, `void`, `never`, `null`, `undefined`) — these are not DI tokens.
- Parameters with **no type annotation** at all.

Classes are only checked when they use one of the configured **class-level** decorators (default: `Component`, `Directive`, `Injectable`, `Pipe`).

## Interaction with `forbid-nested-super-injections`

If a parameter is **unsafe** to turn into a field `inject()` (used inside `super(...)` or in code that runs before `super()` in a subclass), this rule **does not report it**. That case is handled by [`forbid-nested-super-injections`](./forbid-nested-super-injections.md) so severities do not duplicate.

Other parameters in the **same** constructor can still be migrated when they are safe (see [Partial migration in a subclass constructor](#partial-migration-in-a-subclass-constructor)).

## Rule details

- **Type**: suggestion
- **Fixable**: yes (`code`), unless `autofix: false` or the parameter cannot be auto-fixed (unsupported decorators / token).

## Options

Single options object.

### `decorators`

Class-level decorator names that enable this rule for a class.

- Type: `string[]`
- Default: `["Component", "Directive", "Injectable", "Pipe"]`

### `autofix`

When **`false`**, the rule never supplies an ESLint fix (no rewrites on `--fix`).

- Type: `boolean`
- Default: `true`

ESLint does not pass the configured rule severity (`warn` vs `error`) into the rule implementation. If you use **`warn`** and want to avoid fixes, set **`autofix: false`** explicitly.

## Examples

### Partial migration in a subclass constructor

`d` is forwarded into `super(...)` → left as a constructor parameter (see [`forbid-nested-super-injections`](./forbid-nested-super-injections.md)). `y` is only used after `super()` → migrated to a field.

**Before:**

```ts
import { Component } from '@angular/core';

class Base {}
class D {}
class Y {
    use(): void {}
}

@Component({ template: '' })
export class X extends Base {
    constructor(
        private d: D,
        private readonly y: Y,
    ) {
        super(d);
        this.y.use();
    }
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class Base {}
class D {}
class Y {
    use(): void {}
}

@Component({ template: '' })
export class X extends Base {
    constructor(private d: D) {
        super(d);
        this.y.use();
    }

    private readonly y = inject(Y);
}
```

### Report only: union type (no auto-fix)

Union and other non-simple type annotations are reported but not auto-fixed; migrate the token manually (often with `@Inject(...)`).

```ts
import { Component } from '@angular/core';

class A {}
class B {}

@Component({ template: '' })
export class X {
    // preferInject — fix manually (e.g. pick a concrete @Inject token)
    constructor(private readonly x: A | B) {}
}
```

### Report only: unsupported decorator combination

`@Inject` together with `@Attribute` on the same parameter is intentionally manual.

```ts
import { Attribute, Component, Inject } from '@angular/core';

const TOKEN = {};

@Component({ template: '' })
export class X {
    constructor(@Inject(TOKEN) @Attribute('role') private readonly x: string) {}
}
```

### Bare typed parameter (no modifier, no decorator)

Angular injects constructor params by type even without access modifiers. The fixer adds `private readonly` by default.

**Before:**

```ts
import { Component } from '@angular/core';

class Router {
    navigate(_: string): void {}
}

@Component({ template: '' })
export class X {
    constructor(router: Router) {
        router.navigate('/home');
    }
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class Router {
    navigate(_: string): void {}
}

@Component({ template: '' })
export class X {
    constructor() {
        this.router.navigate('/home');
    }

    private readonly router = inject(Router);
}
```

### Mixed: modifier params + bare typed params

When a constructor has both parameter properties and bare typed params, all are migrated together in one batch fix.

**Before:**

```ts
import { Component } from '@angular/core';

class SomeService {}
class Router {}

@Component({ template: '' })
export class X {
    constructor(
        private svc: SomeService,
        router: Router,
    ) {}
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class SomeService {}
class Router {}

@Component({ template: '' })
export class X {
    constructor() {}

    private svc = inject(SomeService);
    private readonly router = inject(Router);
}
```

### Optional bare typed parameter

A `?` on a bare typed param maps to `{ optional: true }` in the inject options — the same as `@Optional()`.

**Before:**

```ts
import { Component } from '@angular/core';

class Router {}

@Component({ template: '' })
export class X {
    constructor(router?: Router) {}
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class Router {}

@Component({ template: '' })
export class X {
    constructor() {}

    private readonly router = inject(Router, { optional: true });
}
```

### Report only: bare param with union/array type (no auto-fix)

Complex type annotations (unions, arrays, generics without a single type reference) are reported but cannot be auto-fixed — the inject token is ambiguous.

```ts
import { Component } from '@angular/core';

class Router {}

@Component({ template: '' })
export class X {
    // preferInject — fix manually
    constructor(router: Router | null, items: Router[]) {}
}
```

## Decorator mapping to `inject(...)`

Decorators are resolved via **`@angular/core` imports** (local names map to the imported symbol).

| Decorator (from `@angular/core`)         | Effect in fix                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `@Inject(token)`                         | First argument: source of `token`                                                    |
| `@Optional()`                            | `inject(..., { optional: true })`                                                    |
| `@Host()`                                | `host: true`                                                                         |
| `@Self()`                                | `self: true`                                                                         |
| `@SkipSelf()`                            | `skipSelf: true`                                                                     |
| `@Attribute('name')` with string literal | `inject(new HostAttributeToken("name"))` and adds `HostAttributeToken` to the import |

Flags merge into **one** options object when needed (stable key order: `host`, `optional`, `self`, `skipSelf`).

If there is **no** `@Inject` and **no** `@Attribute`, the first argument comes from a **simple type reference** on the parameter (`Store`, `ns.Type`). Union types, inline object types, and other complex annotations are **not auto-fixable** (report only).

**Unsupported** parameter decorators (anything outside the table above, `@Inject` without an argument, `@Attribute` without a string literal, or **`@Inject` combined with `@Attribute`**) still report **`preferInject`** with a hint to fix manually, **without** an auto-fix.

### `@Optional()`

**Before:**

```ts
import { Component, Optional } from '@angular/core';

class Store {}

@Component({ template: '' })
export class X {
    constructor(@Optional() private readonly store: Store) {}
}
```

**After `eslint --fix`:**

```ts
import { Component, Optional, inject } from '@angular/core';

class Store {}

@Component({ template: '' })
export class X {
    constructor() {}

    private readonly store = inject(Store, { optional: true });
}
```

### `@Host()` and `@Self()`

**Before:**

```ts
import { Component, Host, Self } from '@angular/core';

class Tok {}

@Component({ template: '' })
export class X {
    constructor(@Host() @Self() private readonly t: Tok) {}
}
```

**After `eslint --fix`:**

```ts
import { Component, Host, Self, inject } from '@angular/core';

class Tok {}

@Component({ template: '' })
export class X {
    constructor() {}

    private readonly t = inject(Tok, { host: true, self: true });
}
```

### `@Attribute('name')` (no `@Inject`)

**Before:**

```ts
import { Attribute, Component } from '@angular/core';

@Component({ template: '' })
export class X {
    constructor(@Attribute('role') private readonly role: string | null) {}
}
```

**After `eslint --fix`:**

```ts
import { Attribute, Component, HostAttributeToken, inject } from '@angular/core';

@Component({ template: '' })
export class X {
    constructor() {}

    private readonly role = inject(new HostAttributeToken('role'));
}
```

## Fixer walkthrough (with examples)

On **`eslint --fix`**, one **batch** fix per constructor migrates **all** fixable parameters in that constructor at once.

### 1. `@angular/core` import

`inject` is added to an existing `@angular/core` import when possible; otherwise a new import is introduced. Extra symbols (e.g. `HostAttributeToken`) are added when needed.

**Before:**

```ts
import { Component } from '@angular/core';

class Svc {}

@Component({ template: '' })
export class X {
    constructor(private readonly svc: Svc) {}
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class Svc {}

@Component({ template: '' })
export class X {
    constructor() {}

    private readonly svc = inject(Svc);
}
```

### 2. Whole constructor parameter list

The inner `( … )` of the constructor is replaced: migrated DI parameters disappear; non-DI parameters stay with correct commas and line breaks.

**Before:**

```ts
import { Component, Inject } from '@angular/core';

class A {}
class B {}
const TOK = {};

@Component({ template: '' })
export class X {
    constructor(
        private readonly a: A,
        private b: B,
        @Inject(TOK) private readonly token: unknown,
    ) {}
}
```

**After `eslint --fix`:**

```ts
import { Component, Inject, inject } from '@angular/core';

class A {}
class B {}
const TOK = {};

@Component({ template: '' })
export class X {
    constructor() {}

    private readonly a = inject(A);
    private b = inject(B);
    private readonly token = inject(TOK);
}
```

### 3. Constructor body: `this.` and object shorthand

Reads of migrated parameters become **`this.<name>`**. **Object literal shorthand** is expanded so the name still refers to the field.

**Before:**

```ts
import { Component } from '@angular/core';

class Item {
    id = 1;
}

@Component({ template: '' })
export class X {
    constructor(private readonly item: Item) {
        const config = { item };
        void config;
    }
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class Item {
    id = 1;
}

@Component({ template: '' })
export class X {
    constructor() {
        const config = { item: this.item };
        void config;
    }

    private readonly item = inject(Item);
}
```

(Plain reads use `this.item` the same way as in the [partial migration](#partial-migration-in-a-subclass-constructor) example.)

### 4. Where new fields are inserted

New fields are inserted **immediately after** the constructor: **one** blank line after the constructor’s closing `}`; multiple new fields are **adjacent** (no extra blank lines between them).

**Before:**

```ts
import { Component } from '@angular/core';

class A {}
class B {}

@Component({ template: '' })
export class X {
    constructor(
        private readonly a: A,
        private readonly b: B,
    ) {}

    regularMethod(): void {}
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class A {}
class B {}

@Component({ template: '' })
export class X {
    constructor() {}

    private readonly a = inject(A);
    private readonly b = inject(B);

    regularMethod(): void {}
}
```

### 5. Access modifiers

Parameter property modifiers are preserved on the new field. A bare parameter without an access modifier (either with `@Inject(...)` or with just a type annotation) becomes **`private readonly`**.

**Before:**

```ts
import { Component } from '@angular/core';

class Pub {}
class Prot {}
class Priv {}

@Component({ template: '' })
export class X {
    constructor(
        public readonly pub: Pub,
        protected prot: Prot,
        private readonly priv: Priv,
    ) {}
}
```

**After `eslint --fix`:**

```ts
import { Component, inject } from '@angular/core';

class Pub {}
class Prot {}
class Priv {}

@Component({ template: '' })
export class X {
    constructor() {}

    public readonly pub = inject(Pub);
    protected prot = inject(Prot);
    private readonly priv = inject(Priv);
}
```

## Notes for ESLint `--fix`

The fix is attached only to the **first** fixable diagnostic for that constructor so ESLint does not apply overlapping text replacements multiple times. After a successful fix, run lint again to clear any remaining messages for that file.

## Messages

- **`preferInject`** — includes `{{name}}` and optional `{{details}}` when the parameter cannot be auto-fixed.

## Limits & caveats

- **Scope / parser**: relies on `@typescript-eslint/parser` and ESLint’s **scope manager** for references and `super()` safety classification.
- **Imports**: does not aggressively remove unused symbols such as `Inject` after a fix; follow up with your formatter or unused-import rules if needed.
- **IIFE** parameters used before `super()` are treated conservatively as unsafe in the companion rule; nested-function cases are approximated.
- **Parameter property + `const`/`let` shadowing**: the fixer skips rewrites when a **`const` or `let`** in an enclosing block with the same name appears **before** the reference. **`this.<name>`** reads are not rewritten.
- **Defaults**: migrating removes constructor-parameter **default initializers**; the new field is plain `inject(...)` (no default). Adjust manually if you relied on a default.
- **Comments inside the parameter list** are not preserved (the whole inner `(`…`)` span is replaced). Put comments above the constructor or on the new fields after fixing.
- **Parentheses in defaults**: the parameter-list range is found by counting `(` / `)` in the constructor slice — defaults containing `(` inside **strings** or **regex literals** could theoretically confuse it; treat unusual cases with care or fix manually.

## Requirements

Lint **TypeScript** with **`@typescript-eslint/parser`** (decorators and parameter properties).

---

## Config examples

### Flat config

```javascript
rules: {
  'angular-class-ordering/prefer-inject-function': [
    'error',
    {
      decorators: ['Component', 'Injectable'],
      autofix: true,
    },
  ],
},
```

### Warn without fixes

```javascript
rules: {
  'angular-class-ordering/prefer-inject-function': [
    'warn',
    { autofix: false },
  ],
},
```
