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
      // Synchronous setState in effects is a common React pattern for resetting derived/controlled
      // state when props change. The rule flags it as an error in eslint-config-expo; downgrade to
      // warn so CI doesn't break while we keep the signal visible.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
