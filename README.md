# eslint-plugin-angular-class-ordering

ESLint plugin focused on **`member-ordering`**: it keeps **Angular class members** (fields and methods) in a consistent order inside `@Component`, `@Directive`, `@Injectable`, and `@Pipe` classes. It understands modern Angular APIs (`inject`, signal-based `input` / `output` / `model`, `signal`, `computed`, queries, and common decorators) and includes **auto-fix** for layout.

Two **optional** rules ship with the same package — **`prefer-inject-function`** (constructor DI → `inject()`, with fix) and **`forbid-nested-super-injections`** (subclass `super()` / field-init ordering; warn-only). They are **not** part of the default preset so installing the plugin only turns on **member ordering** unless you enable the others yourself.

## Requirements

- **Node.js** `^18.18.0 || ^20.9.0 || >=21.1.0`
- **ESLint** `^8.57.0 || ^9.0.0`
- **TypeScript sources** linted with **`@typescript-eslint/parser`** (Angular projects already use this).

## Install

```bash
npm install --save-dev eslint @typescript-eslint/parser eslint-plugin-angular-class-ordering
```

## ESLint flat config (`eslint.config.js`)

```javascript
const angularClassOrdering = require('eslint-plugin-angular-class-ordering');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        plugins: {
            'angular-class-ordering': angularClassOrdering,
        },
        rules: {
            ...angularClassOrdering.configs.recommended.rules,
        },
    },
];
```

The bundled **`recommended`** config enables only **`member-ordering`** at **error**. It does **not** enable `prefer-inject-function` or `forbid-nested-super-injections`, so you do not get unexpected constructor refactors from `--fix` until you opt in.

To opt in to the inject-related rules (typical pairing: `prefer-inject-function` as **error**, `forbid-nested-super-injections` as **warn**), add them next to `recommended`:

```javascript
rules: {
  ...angularClassOrdering.configs.recommended.rules,
  'angular-class-ordering/prefer-inject-function': 'error',
  'angular-class-ordering/forbid-nested-super-injections': 'warn',
},
```

For **`prefer-inject-function`**, set **`autofix: false`** when you want diagnostics without `--fix` rewrites (for example at `warn` severity). ESLint does not pass severity into rule implementations, so this must be configured explicitly. See [prefer-inject-function](docs/rules/prefer-inject-function.md#options) for options and examples.

Override rule options:

```javascript
rules: {
  "angular-class-ordering/member-ordering": [
    "error",
    {
      decorators: ["Component", "Injectable"],
      unknownPlacement: "last",
      readonlyOrdering: false, // optional: keep declaration order within a slot (no readonly-first autofix)
    },
  ],
},
```

## Legacy config (`.eslintrc.cjs`)

```javascript
module.exports = {
    overrides: [
        {
            files: ['*.ts'],
            parser: '@typescript-eslint/parser',
            plugins: ['angular-class-ordering'],
            rules: {
                'angular-class-ordering/member-ordering': 'error',
            },
        },
    ],
};
```

## Rule documentation

- [member-ordering](docs/rules/member-ordering.md) — class member order and auto-fix layout (**on** in `recommended`)
- [prefer-inject-function](docs/rules/prefer-inject-function.md) — prefer `inject()` over constructor DI; options `decorators`, `autofix` (**opt-in**)
- [forbid-nested-super-injections](docs/rules/forbid-nested-super-injections.md) — `super()` / field-init ordering; options `decorators` (**opt-in**)

## Scripts (development)

```bash
npm test
npm run test:watch
npm run lint
npm run lint:fix
npm run format:check
```

## Repository

Source and issue tracker: [github.com/Leritas/eslint-plugin-angular-class-ordering](https://github.com/Leritas/eslint-plugin-angular-class-ordering).

GitHub Actions runs `npm test`, `npm run lint`, and `npm run format:check` on pushes and pull requests to `main` / `master` (Node 18, 20, 22).
