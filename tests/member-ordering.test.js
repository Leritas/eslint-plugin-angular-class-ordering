'use strict';

const { RuleTester } = require('@typescript-eslint/rule-tester');
const parser = require('@typescript-eslint/parser');
const rule = require('../lib/rules/member-ordering').rule;

const ruleTester = new RuleTester({
    languageOptions: {
        parser,
        parserOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            project: false,
        },
    },
});

ruleTester.run('member-ordering', rule, {
    valid: [
        {
            name: 'plain class without Angular decorator is ignored',
            code: `
class Plain {
    b = 2;
    a = 1;
}
`,
        },
        {
            name: 'correct default order (inject → input signal → plain field)',
            code: `
import { Component, inject, input } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);
    readonly title = input<string>();
    plain = 1;
}
`,
        },
        {
            name: 'constructor precedes inject per default order',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    constructor() {}

    private readonly svc = inject(Foo);
}
`,
        },
        {
            name: 'abstract signature precedes constructor',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export abstract class X {
    abstract foo(): void;

    constructor() {}
}
`,
        },
        {
            name: 'signal outputs and model after inputs',
            code: `
import { Component, input, output, model } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly a = input<string>();
    readonly b = output<string>();
    readonly m = model<number>();
}
`,
        },
        {
            name: 'Angular decorator members in default slot order',
            code: `
import { Component, Input, Output, ViewChild, ElementRef } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    @Input() inProp = '';

    @Output() outProp = output<string>();

    @ViewChild('x') ref?: ElementRef;
}
`,
        },
        {
            name: 'signal queries and host bindings (order follows DEFAULT_ORDER slots)',
            code: `
import { Component, viewChild, contentChild, hostBinding } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly hb = hostBinding('class.active');

    readonly vc = viewChild('ref');

    readonly cc = contentChild('slot');
}
`,
        },
        {
            name: 'nested core API inside wrapper call (viewChild)',
            code: `
import { Component, viewChild } from '@angular/core';

function wrap<T>(x: T): T {
    return x;
}

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly ref = wrap(viewChild('x'));
}
`,
        },
        {
            name: 'NgRx-like selectSignal and select member calls',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly fromSignal = this.store.selectSignal(() => 0);

    readonly fromObs = this.store.select(() => 0);

    store = { selectSignal: () => ({}), select: () => ({}) };
}
`,
        },
        {
            name: '@Select decorator maps to store-select-decorator',
            code: `
import { Component } from '@angular/core';
import { Observable } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    @Select() slice$: Observable<unknown>;
}
`,
        },
        {
            name: 'signal linkedSignal computed ordering',
            code: `
import { Component, signal, linkedSignal, computed } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly base = signal(0);

    readonly linked = linkedSignal(() => this.base());

    readonly doubled = computed(() => this.base() * 2);
}
`,
        },
        {
            name: 'visibility tiers for ordinary fields and methods',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    public pubF = 1;

    protected protF = 2;

    private privF = 3;

    public pubM(): void {}

    protected protM(): void {}

    private privM(): void {}
}
`,
        },
        {
            name: 'getter and setter stay paired (same name)',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    private _x = 0;

    get x(): number {
        return this._x;
    }

    set x(v: number) {
        this._x = v;
    }
}
`,
        },
        {
            name: '@Directive class is matched by default decorators',
            code: `
import { Directive, inject } from '@angular/core';

class Foo {}

@Directive({ selector: '[dir]' })
export class Dir {
    private readonly svc = inject(Foo);
}
`,
        },
        {
            name: 'custom decorators option only Pipe',
            code: `
import { Pipe, inject } from '@angular/core';

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
`,
            options: [{ decorators: ['Pipe'] }],
        },
        {
            name: 'export default class declaration',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export default class X {
    private readonly svc = inject(Foo);
}
`,
        },
        {
            name: 'unknownPlacement ignore excludes members not listed in order',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);
    extra = 1;
}
`,
            options: [
                {
                    unknownPlacement: 'ignore',
                    order: ['inject'],
                },
            ],
        },
        {
            name: 'unknownPlacement last ranks unknown slot after configured keys',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    constructor() {}

    private readonly svc = inject(Foo);

    tail = 1;
}
`,
            options: [
                {
                    unknownPlacement: 'last',
                    order: ['constructor', 'inject'],
                },
            ],
        },
        {
            name: 'pattern slot captures member source before ordinary field',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    legacyTracked = true;

    plain = 1;
}
`,
            options: [
                {
                    order: ['inject', { type: 'pattern', regex: 'legacyTracked' }, 'public-instance-field'],
                },
            ],
        },
        {
            name: 'Injectable matches default decorators list',
            code: `
import { Injectable, inject } from '@angular/core';

class Api {}

@Injectable({ providedIn: 'root' })
export class Svc {
    private readonly api = inject(Api);
}
`,
        },
        {
            name: 'HostListener, viewChildren signal, and ContentChildren decorator follow DEFAULT_ORDER',
            code: `
import { Component, HostListener, ContentChildren, viewChildren } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    @HostListener('click')
    onClick(): void {}

    readonly boxes = viewChildren('box');

    @ContentChildren('item') items!: unknown;
}
`,
        },
    ],
    invalid: [
        {
            name: 'wrong member order is reported and fixed',
            code: `
import { Component, inject, input } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    plain = 1;
    private readonly svc = inject(Foo);
    readonly title = input<string>();
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, inject, input } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    readonly title = input<string>();

    plain = 1;
}
`,
        },
        {
            name: 'inject must not appear before constructor when order requires constructor first',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    constructor() {}
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    constructor() {}

    private readonly svc = inject(Foo);
}
`,
        },
        {
            name: 'unknownPlacement error reports unknown members',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);
    extra = 1;
}
`,
            options: [
                {
                    unknownPlacement: 'error',
                    order: ['inject'],
                },
            ],
            errors: [{ messageId: 'unknownCategory' }],
        },
        {
            name: 'when unknownCategory fires, wrongOrder has no fix',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    constructor() {}

    extra = 1;
}
`,
            options: [
                {
                    unknownPlacement: 'error',
                    order: ['constructor', 'inject'],
                },
            ],
            errors: [{ messageId: 'wrongOrder' }, { messageId: 'unknownCategory' }],
        },
        {
            name: 'decorator category out of order vs inject is fixed',
            code: `
import { Component, inject, Input } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    @Input() x = '';

    private readonly svc = inject(Foo);
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, inject, Input } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    @Input() x = '';
}
`,
        },
        {
            name: 'protected method must not precede public method (same-tier visibility ordering)',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    protected prot(): void {}

    public pub(): void {}
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    public pub(): void {}

    protected prot(): void {}
}
`,
        },
        {
            name: 'private static field must not precede public static field',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    private static priv = 1;

    public static pub = 2;
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    public static pub = 2;

    private static priv = 1;
}
`,
        },
    ],
});
