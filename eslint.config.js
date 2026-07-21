import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        // Placeholdery v destrukturalizaci: `([_, v]) => v` a omit přes rest:
        // `const { _score, ...t } = obj`.
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // React Compiler correctness rules (auto-enabled by eslint-plugin-react-hooks v6
      // flat.recommended). Tento projekt React Compiler NEpoužívá a obě pravidla se
      // spouští na záměrně korektním kódu — set-state-in-effect na efektech, které
      // synchronizují UI stav se změnou route/prop/id (zavření sidebaru, reset modalu,
      // obnova scrollu), a purity na Math.random() v event-handlerech přehrávačů
      // (shuffle). Přepis těchto funkčních míst by přinesl jen riziko regresí, proto
      // je držíme vypnuté (ostatní react-hooks pravidla zůstávají aktivní).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    // Node/build skripty (ne prohlížeč) — mají process/require/__dirname/module.
    files: ['deploy.js', 'vite.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
