// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    // dist: the web export. supabase/functions: Deno code with npm: imports, checked by Supabase's own tooling.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
  {
    rules: {
      // A web-HTML rule: apostrophes and quotes in React Native <Text> render as written, and the copy uses them freely.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // Node scripts (sound generation and similar).
    files: ['scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
]);
