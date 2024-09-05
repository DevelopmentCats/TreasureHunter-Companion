module.exports = {
    env: {
      browser: true, // if you're writing code that runs in the browser
      node: true,    // for Node.js environment
      es2021: true,  // support for ECMAScript 2021
    },
    extends: [
      'eslint:recommended', // Use recommended ESLint rules
      'plugin:@typescript-eslint/recommended', // If using TypeScript
      'plugin:react/recommended', // For React projects
    ],
    parser: '@typescript-eslint/parser', // Enable parsing for TypeScript files
    parserOptions: {
      ecmaVersion: 12, // ECMAScript version
      sourceType: 'module', // Use ES6 module system
      ecmaFeatures: {
        jsx: true, // Enable JSX parsing
      },
    },
    plugins: [
      'react', // React plugin
      '@typescript-eslint', // TypeScript plugin
    ],
    rules: {
      // Example rules, customize these based on your project needs
      'no-unused-vars': 'warn', // Warn about unused variables
      'react/react-in-jsx-scope': 'off', // Disable this rule if using React 17+
      '@typescript-eslint/no-explicit-any': 'off', // Allow 'any' type in TypeScript
    },
    settings: {
      react: {
        version: 'detect', // Automatically detect the React version
      },
    },
  };
  