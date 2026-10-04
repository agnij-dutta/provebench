import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules', 'web/node_modules', 'web/dist', 'web/public/data', 'build', 'artifacts', 'circuits'] },
  js.configs.recommended,
  {
    files: ['bench/**/*.mjs', 'scripts/**/*.mjs', 'web/scripts/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/src/**/*.ts', 'web/vite.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
  },
);
