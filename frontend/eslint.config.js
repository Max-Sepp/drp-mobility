// Flat ESLint config. `eslint-config-expo` carries the React / React Native / TS
// rules for an Expo project; `eslint-config-prettier` is listed last so it turns
// off any stylistic rules that would fight Prettier (Prettier owns formatting).
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const eslintConfigPrettier = require('eslint-config-prettier')

module.exports = defineConfig([
  expoConfig,
  eslintConfigPrettier,
  {
    // schema.d.ts is generated (npm run generate:api); everything else is build output.
    ignores: ['dist/*', '.expo/*', '.tamagui/*', 'src/api/schema.d.ts'],
  },
  {
    rules: {
      // Synchronous setState in effects is a common pattern here for resetting derived/controlled
      // state when props change (form resets, loading flags before async). All flagged instances
      // are intentional, so disable the rule entirely.
      'react-hooks/set-state-in-effect': 'off',
      // The React Compiler is not in use; manual useMemo/useCallback calls are intentional
      // (e.g. stable array refs required by BottomSheet). Disable the compiler-only rule.
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
])
