module.exports = {
  env: {
    browser: true, // Set to true if you're targeting browser environments
    node: true,    // Set to true if you're targeting Node.js environments
    es2021: true,  // Enable ECMAScript 2021 features
  },
  extends: [
    'eslint:recommended', // Use the recommended ESLint rules
  ],
  parserOptions: {
    ecmaVersion: 12, // Use ECMAScript 2021 syntax
    sourceType: 'module', // Enable ES6 modules
  },
  rules: {
    // Add or override rules here
    'no-console': 'warn', // Warn on console.log statements
    'no-unused-vars': 'warn', // Warn on unused variables
    'semi': ['error', 'always'], // Enforce semicolons
    'quotes': ['error', 'single'], // Enforce single quotes
  },
};
