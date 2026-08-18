# Contributing

1. Fork the repository and create a branch from `main`.
2. Install dependencies: `npm install`.
3. Make your changes. Keep functions small and add/update tests in `tests/`.
4. Before opening a PR, run locally:
   ```bash
   npm run lint
   npm test
   ```
5. Open a pull request against `main`. GitHub Actions (CI + CodeQL) will run automatically.

## Reporting issues

Please include steps to reproduce, expected vs. actual behavior, and relevant logs (redact any API tokens).
