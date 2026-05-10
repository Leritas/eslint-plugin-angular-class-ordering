# `forbid-nested-super-injections`

Warns when a **constructor DI parameter** on a **subclass** cannot be moved to an **`inject()` field** because it is used **before** field initializers are valid — typically inside **`super(...)`** or in code that runs before the first `super()` call.

In a derived class, instance fields initialized with `inject()` run **after** `super()` completes. Any use of that dependency **during** `super(...)` (or earlier in the constructor) must stay a **constructor parameter** until the base class API is refactored.

This rule is **not** enabled by the plugin’s **`recommended`** preset (that preset only enables [`member-ordering`](./member-ordering.md)). Enable it explicitly when you also use [`prefer-inject-function`](./prefer-inject-function.md).

**Quick navigation:** [Examples](#examples) · [When a parameter is “unsafe”](#when-a-parameter-is-unsafe) · [Config](#config-examples)

## What gets flagged

- Subclasses **`extends`** a base **and** use a decorated Angular class (see `decorators` option).
- A constructor parameter is **DI** (parameter property or `@Inject` from `@angular/core` — same shape as [`prefer-inject-function`](./prefer-inject-function.md)).
- A **read** of that parameter is classified as **unsafe** (see [When a parameter is “unsafe”](#when-a-parameter-is-unsafe) and the examples below).

Plain TypeScript classes **without** the configured Angular decorators are **not** analyzed, even if they use `super(arg)`.

## Interaction with `prefer-inject-function`

- **`forbid-nested-super-injections`** reports **only** parameters that are **unsafe** for field `inject()`.
- **`prefer-inject-function`** reports the **remaining** safe DI parameters in the **same** constructor (often with auto-fix).

You can see a **warning** on one parameter and **errors** (with fixes) on siblings in one constructor.

### What to do about the warning

Refactor the **base** class so the dependency is no longer required through `super(...)` — for example by moving it to **`inject()`** on the parent and exposing a no-arg (or slimmer) constructor. Then the subclass parameter can usually be migrated by **`prefer-inject-function`**.

**Before (subclass must forward `ApiClient` into `super`):**

```ts
import { Component, Injectable } from '@angular/core';

@Injectable()
class ApiClient {}

class BasePage {
    constructor(protected readonly api: ApiClient) {}
}

@Component({ template: '' })
export class ChildPage extends BasePage {
    constructor(private readonly api: ApiClient) {
        super(api);
    }
}
```

**After (parent holds `ApiClient` via `inject()`; subclass DI can move to fields):**

```ts
import { Component, Injectable, inject } from '@angular/core';

@Injectable()
class ApiClient {}

class BasePage {
    protected readonly api = inject(ApiClient);

    constructor() {}
}

@Component({ template: '' })
export class ChildPage extends BasePage {
    constructor() {
        super();
    }
}
```

(You would then run `prefer-inject-function` on `ChildPage` if you add new DI there.)

## Rule details

- **Type**: problem
- **Fixable**: no

## Options

Single options object.

### `decorators`

Class-level decorator names that enable this rule for a class.

- Type: `string[]`
- Default: `["Component", "Directive", "Injectable", "Pipe"]`

(Same default as `prefer-inject-function` so the two rules stay aligned.)

## Examples

### Unsafe: dependency passed into `super(...)`

**Reported** (`forbidNestedSuperInjections`). `prefer-inject-function` does **not** migrate `d`.

```ts
import { Component } from '@angular/core';

class Base {}
class D {}

@Component({ template: '' })
export class X extends Base {
    constructor(private d: D) {
        super(d);
    }
}
```

### Unsafe: read before `super()` completes

**Reported** — `console.log(d)` runs before `super()`.

```ts
import { Component } from '@angular/core';

class Base {}
class D {}

@Component({ template: '' })
export class X extends Base {
    constructor(private d: D) {
        console.log(d);
        super();
    }
}
```

### Unsafe: two parameters both passed to `super()`

Both parameters are reported.

```ts
import { Component } from '@angular/core';

class Base {}
class A {}
class B {}

@Component({ template: '' })
export class X extends Base {
    constructor(
        private a: A,
        private b: B,
    ) {
        super(a, b);
    }
}
```

### Unsafe: `@Inject` parameter forwarded into `super()`

```ts
import { Component, Inject } from '@angular/core';

class Base {}
const TOKEN = {};

@Component({ template: '' })
export class X extends Base {
    constructor(@Inject(TOKEN) private readonly dep: unknown) {
        super(dep);
    }
}
```

### Safe for this rule: only used after `super()`

**Not** reported by `forbid-nested-super-injections`. `prefer-inject-function` may migrate `y` to a field.

```ts
import { Component } from '@angular/core';

class Base {}
class Y {
    x(): void {}
}

@Component({ template: '' })
export class X extends Base {
    constructor(private readonly y: Y) {
        super();
        this.y.x();
    }
}
```

### Deferred read: parameter only referenced inside a non-invoked arrow

The read is **not** treated as running before `super()` — **not** reported.

```ts
import { Component } from '@angular/core';

class Base {}
class D {}

@Component({ template: '' })
export class X extends Base {
    constructor(private d: D) {
        const fn = () => d;
        super();
        void fn;
    }
}
```

### IIFE before `super()` — conservatively unsafe

**Reported** — immediately invoked functions are treated as eager.

```ts
import { Component } from '@angular/core';

class Base {}
class D {}

@Component({ template: '' })
export class X extends Base {
    constructor(private d: D) {
        (() => d)();
        super();
    }
}
```

### `function` declaration closure — stricter than arrows

**Reported** today: only `ArrowFunctionExpression` / `FunctionExpression` get the “deferred read” shortcut for non-invoked nested functions, **not** `FunctionDeclaration`.

```ts
import { Component } from '@angular/core';

class Base {}
class D {}

@Component({ template: '' })
export class X extends Base {
    constructor(private d: D) {
        function inner() {
            return d;
        }
        void inner;
        super();
    }
}
```

### Limitation: no call graph

**Not** reported — at runtime `f()` could run before `super()`, but the heuristic does not track that dataflow.

```ts
import { Component } from '@angular/core';

class Base {}
class D {}

@Component({ template: '' })
export class X extends Base {
    constructor(private d: D) {
        const f = () => d;
        f();
        super();
    }
}
```

### Same constructor: warning + fixable sibling

`d` stays **warn** (unsafe). `y` can be **`prefer-inject-function`** with fix (see that rule’s partial migration example).

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

## When a parameter is “unsafe”

The implementation combines the AST, **scope** references, and a **parent-chain** heuristic:

- Uses inside **`super(...)`** arguments → unsafe.
- Uses in the constructor body **before** the closing `)` of the first `super()` call → unsafe.
- Uses that appear **only** inside nested function bodies (e.g. `() => dep`) without invocation → **not** unsafe (deferred).
- **Immediately invoked** function expressions → unsafe (conservative).
- **`function` declaration** that closes over the parameter (not invoked) → **unsafe** (asymmetry vs arrows; see [example](#function-declaration-closure--stricter-than-arrows)).
- **No call graph**: invoked closures before `super()` may be missed (see [limitation example](#limitation-no-call-graph)).

Base classes **without** `extends` do not get this “before `super`” analysis.

## Messages

- **`forbidNestedSuperInjections`** — includes `{{name}}` and explains the `super()` / field-init ordering issue.

## Requirements

Lint **TypeScript** with **`@typescript-eslint/parser`**.

---

## Config examples

### Flat config (opt-in)

Spread `recommended` for **`member-ordering`**, then add this rule (and usually `prefer-inject-function`) yourself:

```javascript
rules: {
  ...angularClassOrdering.configs.recommended.rules,
  'angular-class-ordering/prefer-inject-function': 'error',
  'angular-class-ordering/forbid-nested-super-injections': 'warn',
},
```

### Explicit (this rule only)

```javascript
rules: {
  'angular-class-ordering/forbid-nested-super-injections': [
    'warn',
    { decorators: ['Component', 'Directive', 'Injectable', 'Pipe'] },
  ],
},
```
