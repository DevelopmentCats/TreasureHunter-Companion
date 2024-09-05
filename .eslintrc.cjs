module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  extends: [
    'airbnb', // Use Airbnb's base JS style guide
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // You can override specific rules here
    'no-console': 'warn',
    'no-unused-vars': 'warn',
  },
};
