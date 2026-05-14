/* Partial rule options in cases mirror ESLint runtime; RuleTester typings expect the full default tuple. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { RuleTester } from '@typescript-eslint/rule-tester';
import parser from '@typescript-eslint/parser';
import { rule } from '../src/rules/member-ordering';

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
            name: 'constructor precedes abstract members per default order',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export abstract class X {
    constructor() {}

    abstract foo(): void;
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
            name: 'NGXS createSelectMap from @ngxs/store maps to store-select-map before @Select',
            code: `
import { Component } from '@angular/core';
import { createSelectMap } from '@ngxs/store';
import { Observable } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;
declare const Slice: { a: unknown; b: unknown };

@Component({ selector: 'app-x', template: '' })
export class X {
    public selectors = createSelectMap({ a: Slice.a, b: Slice.b });

    @Select() a$: Observable<unknown>;
}
`,
        },
        {
            name: 'createSelectMap nested in wrapper call maps to store-select-map',
            code: `
import { Component } from '@angular/core';
import { createSelectMap } from '@ngxs/store';

function wrap<T>(v: T): T {
    return v;
}

declare const Slice: { a: unknown };

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly selectors = wrap(createSelectMap({ a: Slice.a }));
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
            options: [{ decorators: ['Pipe'] }] as any,
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
            ] as any,
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
            ] as any,
        },
        {
            name: 'regex: shorthand overlays before public-instance-field',
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
                    order: ['inject', 'regex:legacyTracked', 'public-instance-field'],
                },
            ] as any,
        },
        {
            name: 'inject() with import alias resolves to inject slot',
            code: `
import { Component, inject as injectService } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = injectService(Foo);
}
`,
        },
        {
            name: 'nested signal() with local import alias resolves to signal slot',
            code: `
import { Component, signal as sig } from '@angular/core';

function wrap<T>(v: T) {
    return v;
}

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly boxed = wrap(sig(0));
}
`,
        },
        {
            name: 'custom-func overlays between signal and linkedSignal',
            code: `
import { Component, signal, linkedSignal } from '@angular/core';

declare function boxedSignal<T>(v: T): T;

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly plainSig = signal(0);

    readonly wrapped = boxedSignal(1);

    readonly linked = linkedSignal(() => this.plainSig());
}
`,
            options: [
                {
                    order: ['signal', 'custom-func-boxedSignal', 'linkedSignal', 'computed', 'public-instance-field'],
                },
            ] as any,
        },
        {
            name: 'custom-dec slot for non-Angular decorator overlays before ordinary field',
            code: `
import { Component } from '@angular/core';

declare function Track(opts?: unknown): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    @Track() trackedVal = true;

    plain = 1;
}
`,
            options: [
                {
                    order: ['constructor', 'custom-dec-Track', 'public-instance-field'],
                },
            ] as any,
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
        {
            name: 'call named inject not from @angular/core is ordinary field, not inject slot',
            code: `
import { Component, inject as ngInject } from '@angular/core';

class Service {}

function inject<T>(t: T): T {
    return t;
}

@Component({ selector: 'app-x', template: '' })
export class X {
    constructor() {}

    private readonly fromCore = ngInject(Service);

    fromLocalFn = inject(Service);
}
`,
        },
        {
            name: 'static block alongside members does not confuse ordering',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    static {
        void 0;
    }

    constructor() {}

    private readonly svc = inject(Foo);
}
`,
        },
        {
            name: '@HostBinding on concrete getter uses host-binding-decorator before signals',
            code: `
import { Component, HostBinding, signal, computed } from '@angular/core';

@Component({ selector: 'app-demo-panel', template: '' })
export class DemoPanel {
    @HostBinding('attr.data-state')
    get hostState(): string {
        return this.mode();
    }

    readonly mode = signal<'on' | 'off'>('off');

    readonly summary = computed(() => String(this.mode()));
}
`,
        },
        {
            name: '@HostBinding getter pairs with same-name setter in host-binding slot before signals',
            code: `
import { Component, HostBinding, signal } from '@angular/core';

@Component({ selector: 'app-pair-host', template: '' })
export class PairHost {
    @HostBinding('attr.data-x')
    get hostToken(): string {
        return String(this.alpha());
    }

    set hostToken(value: string) {
        void value;
    }

    readonly alpha = signal(0);

    readonly beta = signal(1);
}
`,
        },
        {
            name: '@Input on abstract property before signals (abstract property + decorator)',
            code: `
import { Component, Input, signal } from '@angular/core';

@Component({ selector: 'app-demo-shell', template: '' })
export abstract class DemoShell {
    @Input() abstract rowLabel: string;

    readonly phase = signal(0);
}
`,
        },
        {
            name: 'readonlyOrdering false allows mutable field above readonly in same public-instance-field',
            options: [{ readonlyOrdering: false }] as any,
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    public total = this.chunk;

    public readonly chunk = 1;
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
            name: 'autofix keeps each member JSDoc attached when reordering',
            code: `
import { Component, inject, input } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    /** Documents plain field. */
    plain = 1;

    /** Documents injected service. */
    private readonly svc = inject(Foo);

    /** Documents title input. */
    readonly title = input<string>();
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, inject, input } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    /** Documents injected service. */
    private readonly svc = inject(Foo);

    /** Documents title input. */
    readonly title = input<string>();

    /** Documents plain field. */
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
            name: '@HostBinding getter must move above signal and computed when listed after them',
            code: `
import { Component, HostBinding, signal, computed } from '@angular/core';

@Component({ selector: 'app-demo-panel', template: '' })
export class DemoPanel {
    readonly mode = signal<'on' | 'off'>('off');

    readonly summary = computed(() => String(this.mode()));

    @HostBinding('attr.data-state')
    get hostState(): string {
        return this.mode();
    }
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, HostBinding, signal, computed } from '@angular/core';

@Component({ selector: 'app-demo-panel', template: '' })
export class DemoPanel {
    @HostBinding('attr.data-state')
    get hostState(): string {
        return this.mode();
    }

    readonly mode = signal<'on' | 'off'>('off');

    readonly summary = computed(() => String(this.mode()));
}
`,
        },
        {
            name: '@HostBinding getter + same-name setter: pair stays contiguous in host-binding above signals after fix',
            code: `
import { Component, HostBinding, signal } from '@angular/core';

@Component({ selector: 'app-pair-host', template: '' })
export class PairHost {
    readonly alpha = signal(0);

    set hostToken(value: string) {
        void value;
    }

    readonly beta = signal(1);

    @HostBinding('attr.data-x')
    get hostToken(): string {
        return String(this.alpha());
    }
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, HostBinding, signal } from '@angular/core';

@Component({ selector: 'app-pair-host', template: '' })
export class PairHost {
    @HostBinding('attr.data-x')
    get hostToken(): string {
        return String(this.alpha());
    }
    set hostToken(value: string) {
        void value;
    }

    readonly alpha = signal(0);
    readonly beta = signal(1);
}
`,
        },
        {
            name: '@Input abstract property must move above signal when signal is listed first',
            code: `
import { Component, Input, signal } from '@angular/core';

@Component({ selector: 'app-demo-shell', template: '' })
export abstract class DemoShell {
    readonly phase = signal(0);

    @Input() abstract rowLabel: string;
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, Input, signal } from '@angular/core';

@Component({ selector: 'app-demo-shell', template: '' })
export abstract class DemoShell {
    @Input() abstract rowLabel: string;

    readonly phase = signal(0);
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
            ] as any,
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
            ] as any,
            errors: [{ messageId: 'wrongOrder' }, { messageId: 'unknownCategory' }],
            output: null,
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
            name: 'createSelectMap after @Select is reordered before @Select',
            code: `
import { Component } from '@angular/core';
import { createSelectMap } from '@ngxs/store';
import { Observable } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;
declare const Slice: { a: unknown };

@Component({ selector: 'app-x', template: '' })
export class X {
    @Select() a$: Observable<unknown>;

    public selectors = createSelectMap({ a: Slice.a });
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component } from '@angular/core';
import { createSelectMap } from '@ngxs/store';
import { Observable } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;
declare const Slice: { a: unknown };

@Component({ selector: 'app-x', template: '' })
export class X {
    public selectors = createSelectMap({ a: Slice.a });

    @Select() a$: Observable<unknown>;
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
            name: 'pattern overlay out of rank vs ordinary field gets fixed',
            code: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    plain = 1;

    legacyTracked = true;
}
`,
            options: [
                {
                    order: ['inject', { type: 'pattern', regex: 'legacyTracked' }, 'public-instance-field'],
                },
            ] as any,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, inject } from '@angular/core';

class Foo {}

@Component({ selector: 'app-x', template: '' })
export class X {
    private readonly svc = inject(Foo);

    legacyTracked = true;

    plain = 1;
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
        {
            name: 'full DEFAULT_ORDER showcase: chaotic members then auto-fixed layout',
            code: `
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
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
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
`,
        },
        {
            name: 'boxedSignal field after linkedSignal violates custom-func overlay order',
            code: `
import { Component, signal, linkedSignal } from '@angular/core';

declare function boxedSignal<T>(v: T): T;

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly plainSig = signal(0);

    readonly linked = linkedSignal(() => this.plainSig());

    readonly wrapped = boxedSignal(1);
}
`,
            options: [
                {
                    order: ['signal', 'custom-func-boxedSignal', 'linkedSignal', 'computed', 'public-instance-field'],
                },
            ] as any,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, signal, linkedSignal } from '@angular/core';

declare function boxedSignal<T>(v: T): T;

@Component({ selector: 'app-x', template: '' })
export class X {
    readonly plainSig = signal(0);

    readonly wrapped = boxedSignal(1);

    readonly linked = linkedSignal(() => this.plainSig());
}
`,
        },
        {
            name: '@Track field after ordinary field violates custom-dec overlay order',
            code: `
import { Component } from '@angular/core';

declare function Track(opts?: unknown): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    plain = 1;

    @Track() trackedVal = true;
}
`,
            options: [
                {
                    order: ['constructor', 'custom-dec-Track', 'public-instance-field'],
                },
            ] as any,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component } from '@angular/core';

declare function Track(opts?: unknown): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    @Track() trackedVal = true;

    plain = 1;
}
`,
        },
        {
            name: 'ternary with inject() branches classifies as public field — fix pulls core inject above',
            code: `
import { Component, inject } from '@angular/core';

class A {}
class B {}

@Component({ selector: 'app-x', template: '' })
export class X {
    constructor() {}

    flag = true;

    x = flag ? inject(A) : inject(B);

    y = inject(A);
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, inject } from '@angular/core';

class A {}
class B {}

@Component({ selector: 'app-x', template: '' })
export class X {
    constructor() {}

    y = inject(A);

    flag = true;
    x = flag ? inject(A) : inject(B);
}
`,
        },
        {
            name: 'readonly public field sorts above mutable in same public-instance-field tier (default readonlyOrdering)',
            code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    public total = this.chunk;

    public readonly chunk = 1;
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    public readonly chunk = 1;

    public total = this.chunk;
}
`,
        },
    ],
});
