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

ruleTester.run('member-ordering (real-world patterns)', rule, {
    valid: [],
    invalid: [
        {
            name: 'real-world component: inline comment, @Select wall, @ViewChild wall, getter before ctor',
            code: `
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Inject,
    Input,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import { NgModel } from '@angular/forms';
import { Observable, Subject } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;
declare function createSelectMap(map: Record<string, unknown>): unknown;
declare const SomeSelectors: { isReady: unknown; isPending: unknown; data: unknown; items: unknown };
declare const OtherSelectors: { documentsCount: unknown };

@Component({
    selector: 'app-detail',
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class DetailComponent implements OnInit, OnDestroy {
    public get canManageFinance(): boolean {
        return true;
    }

    constructor(
        private readonly cdr: ChangeDetectorRef,
        @Inject('WINDOW') private readonly window: Window,
    ) {}

    @Input() public auctionLotId: string; // query param from url via bindToComponentInputs

    public selectors = createSelectMap({
        isReady: SomeSelectors.isReady,
        documentsCount: OtherSelectors.documentsCount,
    });

    @Select(SomeSelectors.isReady)
    public readonly isReady$: Observable<boolean>;

    @Select(SomeSelectors.isPending)
    public isPending$: Observable<boolean>;

    @Select(SomeSelectors.data)
    public data$: Observable<unknown>;

    @Select(SomeSelectors.items)
    public items$: Observable<unknown[]>;

    @ViewChild('savePopoverRef')
    public savePopoverRef: unknown;

    @ViewChild('finishPopoverRef')
    public finishPopoverRef: unknown;

    @ViewChild('commentControlRef')
    public commentControlRef: NgModel;

    public chartWidth = '542px';
    public isFullMode = false;

    public readonly SUMMARY_TAB_TYPES = {
        GRAPH: 'graph',
        LIST: 'list',
    };

    private destroy$: Subject<void> = new Subject<void>();

    public ngOnInit(): void {
        void 0;
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    public onSave(): void {
        void 0;
    }

    private cleanup(): void {
        void 0;
    }
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Inject,
    Input,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import { NgModel } from '@angular/forms';
import { Observable, Subject } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;
declare function createSelectMap(map: Record<string, unknown>): unknown;
declare const SomeSelectors: { isReady: unknown; isPending: unknown; data: unknown; items: unknown };
declare const OtherSelectors: { documentsCount: unknown };

@Component({
    selector: 'app-detail',
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class DetailComponent implements OnInit, OnDestroy {
    constructor(
        private readonly cdr: ChangeDetectorRef,
        @Inject('WINDOW') private readonly window: Window,
    ) {}

    @Input() public auctionLotId: string; // query param from url via bindToComponentInputs

    @ViewChild('savePopoverRef')
    public savePopoverRef: unknown;

    @ViewChild('finishPopoverRef')
    public finishPopoverRef: unknown;

    @ViewChild('commentControlRef')
    public commentControlRef: NgModel;

    @Select(SomeSelectors.isPending)
    public isPending$: Observable<boolean>;

    @Select(SomeSelectors.data)
    public data$: Observable<unknown>;

    @Select(SomeSelectors.items)
    public items$: Observable<unknown[]>;

    @Select(SomeSelectors.isReady)
    public readonly isReady$: Observable<boolean>;

    public selectors = createSelectMap({
        isReady: SomeSelectors.isReady,
        documentsCount: OtherSelectors.documentsCount,
    });
    public chartWidth = '542px';
    public isFullMode = false;

    public readonly SUMMARY_TAB_TYPES = {
        GRAPH: 'graph',
        LIST: 'list',
    };

    private destroy$: Subject<void> = new Subject<void>();

    public get canManageFinance(): boolean {
        return true;
    }

    public ngOnInit(): void {
        void 0;
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    public onSave(): void {
        void 0;
    }

    private cleanup(): void {
        void 0;
    }
}
`,
        },
        {
            name: 'inline trailing comment does not cause member duplication',
            code: `
import { Component, Input, ViewChild } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    @ViewChild('ref') ref: unknown;

    @Input() myInput: string; // important trailing comment

    plain = 1;
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, Input, ViewChild } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    @Input() myInput: string; // important trailing comment

    @ViewChild('ref') ref: unknown;

    plain = 1;
}
`,
        },
        {
            name: 'multiple @Select members get blank lines between them',
            code: `
import { Component } from '@angular/core';
import { Observable } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    plain = 1;

    @Select() a$: Observable<unknown>;

    @Select() b$: Observable<unknown>;

    @Select() c$: Observable<unknown>;
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component } from '@angular/core';
import { Observable } from 'rxjs';

declare function Select(...args: unknown[]): PropertyDecorator;

@Component({ selector: 'app-x', template: '' })
export class X {
    @Select() a$: Observable<unknown>;

    @Select() b$: Observable<unknown>;

    @Select() c$: Observable<unknown>;

    plain = 1;
}
`,
        },
        {
            name: 'multiple @ViewChild members get blank lines between them',
            code: `
import { Component, ViewChild } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    plain = 1;

    @ViewChild('a')
    refA: unknown;

    @ViewChild('b')
    refB: unknown;

    @ViewChild('c')
    refC: unknown;
}
`,
            errors: [{ messageId: 'wrongOrder' }],
            output: `
import { Component, ViewChild } from '@angular/core';

@Component({ selector: 'app-x', template: '' })
export class X {
    @ViewChild('a')
    refA: unknown;

    @ViewChild('b')
    refB: unknown;

    @ViewChild('c')
    refC: unknown;

    plain = 1;
}
`,
        },
    ],
});
