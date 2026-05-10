/* eslint-disable @typescript-eslint/no-explicit-any */
import { RuleTester } from '@typescript-eslint/rule-tester';
import parser from '@typescript-eslint/parser';
import { rule as forbidNestedRule } from '../src/rules/forbid-nested-super-injections';
import { rule as preferInjectRule } from '../src/rules/prefer-inject-function';

const ruleTester = new RuleTester({
    languageOptions: {
        parser,
        parserOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            project: false,
        },
    },
} as any);

ruleTester.run('prefer-inject-function', preferInjectRule, {
    valid: [
        {
            name: 'ignores class without Angular decorator',
            code: `
class Plain {
  constructor(public x: number) {}
}
`,
        },
        {
            name: 'already uses inject field',
            code: `
import { Component, inject } from '@angular/core';
class S {}
@Component({ template: '' })
export class X {
  constructor() {}
  private readonly s = inject(S);
}
`,
        },
        {
            name: 'no prefer-inject when every DI param is unsafe (super forwards all)',
            code: `
import { Component } from '@angular/core';
class Base {}
class A {}
class B {}
@Component({ template: '' })
export class X extends Base {
  constructor(private readonly a: A, private b: B) {
    super(a, b);
  }
}
`,
        },
    ],
    invalid: [
        {
            name: 'migrates simple private readonly service param',
            code: `
import { Component } from '@angular/core';
class Svc {}
@Component({ template: '' })
export class X {
  constructor(private readonly svc: Svc) {}
}
`,
            output: `
import { Component, inject } from '@angular/core';
class Svc {}
@Component({ template: '' })
export class X {
  constructor() {}

  private readonly svc = inject(Svc);
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: 'rewrites bare identifier to this in constructor body',
            code: `
import { Component, Inject } from '@angular/core';
const APP_ENV = { adminMetrikaCounter: 1 };
class AnalyticsService { analyticsStats = {}; }
@Component({ template: '' })
export class X {
  constructor(
    private readonly analyticsService: AnalyticsService,
    @Inject(APP_ENV) private readonly environment: typeof APP_ENV,
  ) {
    if (this.environment.adminMetrikaCounter) {
      this.analyticsService.analyticsStats = { metrikaId: environment.adminMetrikaCounter };
    }
  }
}
`,
            output: `
import { Component, Inject, inject } from '@angular/core';
const APP_ENV = { adminMetrikaCounter: 1 };
class AnalyticsService { analyticsStats = {}; }
@Component({ template: '' })
export class X {
  constructor() {
    if (this.environment.adminMetrikaCounter) {
      this.analyticsService.analyticsStats = { metrikaId: this.environment.adminMetrikaCounter };
    }
  }

  private readonly analyticsService = inject(AnalyticsService);
  private readonly environment = inject(APP_ENV);
}
`,
            errors: [{ messageId: 'preferInject' }, { messageId: 'preferInject' }],
        },
        {
            name: '@Optional maps to inject option',
            code: `
import { Component, Optional } from '@angular/core';
class Store {}
@Component({ template: '' })
export class X {
  constructor(@Optional() private readonly store: Store) {}
}
`,
            output: `
import { Component, Optional, inject } from '@angular/core';
class Store {}
@Component({ template: '' })
export class X {
  constructor() {}

  private readonly store = inject(Store, { optional: true });
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: '@Host and @Self flags',
            code: `
import { Component, Host, Self } from '@angular/core';
class Tok {}
@Component({ template: '' })
export class X {
  constructor(@Host() @Self() private readonly t: Tok) {}
}
`,
            output: `
import { Component, Host, Self, inject } from '@angular/core';
class Tok {}
@Component({ template: '' })
export class X {
  constructor() {}

  private readonly t = inject(Tok, { host: true, self: true });
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: 'partial migration when sibling used in super',
            code: `
import { Component } from '@angular/core';
class Base {}
class D {}
class Y {}
@Component({ template: '' })
export class X extends Base {
  constructor(private d: D, private readonly y: Y) {
    super(d);
    this.y.use();
  }
}
`,
            output: `
import { Component, inject } from '@angular/core';
class Base {}
class D {}
class Y {}
@Component({ template: '' })
export class X extends Base {
  constructor(private d: D) {
    super(d);
    this.y.use();
  }

  private readonly y = inject(Y);
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: 'autofix false yields no output change',
            code: `
import { Component } from '@angular/core';
class Svc {}
@Component({ template: '' })
export class X {
  constructor(private readonly svc: Svc) {}
}
`,
            options: [{ autofix: false }],
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: 'default param value with nested parens and arrow does not break param list fix',
            code: `
import { Component } from '@angular/core';
class Svc {}
function makeSvc(_fn: () => number): Svc {
  return {} as Svc;
}
@Component({ template: '' })
export class X {
  constructor(private readonly svc: Svc = makeSvc(() => 1)) {}
}
`,
            output: `
import { Component, inject } from '@angular/core';
class Svc {}
function makeSvc(_fn: () => number): Svc {
  return {} as Svc;
}
@Component({ template: '' })
export class X {
  constructor() {}

  private readonly svc = inject(Svc);
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: 'does not prefix this when constructor param name is shadowed locally',
            code: `
import { Component } from '@angular/core';
class Svc {
  id = 'field';
}
@Component({ template: '' })
export class X {
  constructor(private readonly svc: Svc) {
    const svc = { id: 'shadow' };
    console.log(svc.id);
    console.log(this.svc.id);
  }
}
`,
            output: `
import { Component, inject } from '@angular/core';
class Svc {
  id = 'field';
}
@Component({ template: '' })
export class X {
  constructor() {
    const svc = { id: 'shadow' };
    console.log(svc.id);
    console.log(this.svc.id);
  }

  private readonly svc = inject(Svc);
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: 'batch migrates multiple DI params in one fix',
            code: `
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
`,
            output: `
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
`,
            errors: [{ messageId: 'preferInject' }, { messageId: 'preferInject' }, { messageId: 'preferInject' }],
        },
        {
            name: 'union type param is reported without autofix',
            code: `
import { Component } from '@angular/core';
class A {}
class B {}
@Component({ template: '' })
export class X {
  constructor(private readonly x: A | B) {}
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: '@Inject combined with @Attribute is manual (no fix)',
            code: `
import { Attribute, Component, Inject } from '@angular/core';
const TOKEN = {};
@Component({ template: '' })
export class X {
  constructor(@Inject(TOKEN) @Attribute('role') private readonly x: string) {}
}
`,
            errors: [{ messageId: 'preferInject' }],
        },
        {
            name: 'preserves public and protected parameter property modifiers',
            code: `
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
`,
            output: `
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
`,
            errors: [{ messageId: 'preferInject' }, { messageId: 'preferInject' }, { messageId: 'preferInject' }],
        },
    ],
});

ruleTester.run('forbid-nested-super-injections', forbidNestedRule, {
    valid: [
        {
            name: 'no extends',
            code: `
import { Component } from '@angular/core';
class Svc {}
@Component({ template: '' })
export class X {
  constructor(private readonly svc: Svc) {}
}
`,
        },
        {
            name: 'extends but dependency only after super',
            code: `
import { Component } from '@angular/core';
class Base {}
class Y {}
@Component({ template: '' })
export class X extends Base {
  constructor(private readonly y: Y) {
    super();
    this.y.x();
  }
}
`,
        },
        {
            name: 'ignores non-Angular class even with extends and super(arg)',
            code: `
class Base {}
class D {}
export class Plain extends Base {
  constructor(private d: D) {
    super(d);
  }
}
`,
        },
        {
            name: 'param only referenced inside non-invoked arrow before super — not unsafe',
            code: `
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
`,
        },
        {
            name: 'closure invoked before super is still valid — heuristic does not track call-to-closure dataflow',
            code: `
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
`,
        },
    ],
    invalid: [
        {
            name: 'param passed to super',
            code: `
import { Component } from '@angular/core';
class Base {}
class D {}
@Component({ template: '' })
export class X extends Base {
  constructor(private d: D) {
    super(d);
  }
}
`,
            errors: [{ messageId: 'forbidNestedSuperInjections' }],
        },
        {
            name: 'param read before super line',
            code: `
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
`,
            errors: [{ messageId: 'forbidNestedSuperInjections' }],
        },
        {
            name: 'two DI params both used in super arguments',
            code: `
import { Component } from '@angular/core';
class Base {}
class A {}
class B {}
@Component({ template: '' })
export class X extends Base {
  constructor(private a: A, private b: B) {
    super(a, b);
  }
}
`,
            errors: [{ messageId: 'forbidNestedSuperInjections' }, { messageId: 'forbidNestedSuperInjections' }],
        },
        {
            name: '@Inject param forwarded into super',
            code: `
import { Component, Inject } from '@angular/core';
class Base {}
const TOKEN = {};
@Component({ template: '' })
export class X extends Base {
  constructor(@Inject(TOKEN) private readonly dep: unknown) {
    super(dep);
  }
}
`,
            errors: [{ messageId: 'forbidNestedSuperInjections' }],
        },
        {
            name: 'param read inside IIFE before super',
            code: `
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
`,
            errors: [{ messageId: 'forbidNestedSuperInjections' }],
        },
        {
            name: 'param read inside function declaration before super — snapshot (stricter than non-invoked arrow)',
            code: `
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
`,
            errors: [{ messageId: 'forbidNestedSuperInjections' }],
        },
    ],
});
