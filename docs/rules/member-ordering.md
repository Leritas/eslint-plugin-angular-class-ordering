# `member-ordering`

Enforces a consistent, Angular-aware order for class members in classes decorated with Angular decorators (by default: `Component`, `Directive`, `Injectable`, `Pipe`).

The rule classifies members using:

- `@angular/core` APIs resolved via imports (`inject`, `input`, `output`, `model`, `signal`, `viewChild`, …)
- Common Angular decorators (`@Input`, `@ViewChild`, `@HostBinding`, …)
- Access modifiers for ordinary fields and methods (`public-instance-field`, …)
- Optional custom regex patterns in the `order` option

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

Ordered list of member categories and optional pattern slots.

Each entry is either:

- A **category string** (see table below), or
- An object `{ type: "pattern", regex: string, flags?: string }` matching member source text for custom placement.

Default order matches the built-in category identifiers used by the rule.

### `unknownPlacement`

How to treat members whose category is not listed in `order` (and does not match a pattern slot).

- `"last"` (default): place after all known slots when sorting; auto-fix still applies when order violations are reported.
- `"ignore"`: exclude those members from ordering checks.
- `"error"`: report `unknownCategory`; **auto-fix is disabled** while any unknown member exists.

## Categories (default order)

| Slot                                                                         | Meaning                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `signature`                                                                  | Abstract methods                                     |
| `constructor`                                                                | Constructor                                          |
| `inject`                                                                     | `inject(...)` fields                                 |
| `input-signal` / `output-signal` / `model-signal`                            | Signal-based inputs/outputs/model                    |
| `input-decorator` / `output-decorator`                                       | `@Input()` / `@Output()`                             |
| `host-binding-signal` / `host-binding-decorator`                             | `hostBinding` / `@HostBinding` / `@HostListener`     |
| `view-query-signal` / `view-query-decorator`                                 | `viewChild` / `@ViewChild`                           |
| `content-query-signal` / `content-query-decorator`                           | `contentChild` / `@ContentChild`                     |
| `store-select-signal` / `store-select-observable` / `store-select-decorator` | NgRx-style `.selectSignal` / `.select` / `@Select()` |
| `signal` / `linkedSignal` / `computed`                                       | `signal()`, `linkedSignal()`, `computed()`           |
| `public-*-field` / `protected-*-field` / `private-*-field`                   | Ordinary fields by visibility                        |
| `public-*-method` / …                                                        | Methods by visibility                                |

Getter/setter pairs share the higher-priority category of the pair; the setter stays adjacent to the getter.

## Fixer behavior

- Members are reordered inside the class body; leading comments attached to a member are moved with it.
- Blank lines between chunks follow heuristics (e.g. blank line after constructor, between methods, when categories change).
- Edge cases with unusual comment placement should be reviewed after `--fix`.

## Requirements

Lint **TypeScript** sources with **`@typescript-eslint/parser`** so decorators, type annotations, and Angular APIs parse correctly.
