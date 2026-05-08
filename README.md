# eslint-plugin-angular-class-ordering

ESLint plugin that keeps **Angular class members** (fields and methods) in a consistent order inside `@Component`, `@Directive`, `@Injectable`, and `@Pipe` classes. It understands modern Angular APIs (`inject`, signal-based `input` / `output` / `model`, `signal`, `computed`, queries, and common decorators) and includes an **auto-fix** that rewrites the class body.

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
            'angular-class-ordering/member-ordering': 'error',
        },
    },
];
```

Override rule options:

```javascript
rules: {
  "angular-class-ordering/member-ordering": [
    "error",
    {
      decorators: ["Component", "Injectable"],
      unknownPlacement: "last",
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

See [docs/rules/member-ordering.md](docs/rules/member-ordering.md).

## Scripts (development)

```bash
npm test
npm run test:watch
npm run lint
npm run format:check
```

## Repository

Source and issue tracker: [github.com/Leritas/eslint-plugin-angular-class-ordering](https://github.com/Leritas/eslint-plugin-angular-class-ordering).

GitHub Actions runs `npm test`, `npm run lint`, and `npm run format:check` on pushes and pull requests to `main` / `master` (Node 18, 20, 22).
