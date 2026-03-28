module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'indent': 'off',
    'linebreak-style': 'off',
    'quotes': 'off',
    'semi': ['error', 'always'],
    'no-unused-vars': ['warn', { 'varsIgnorePattern': '^_', 'argsIgnorePattern': '^_' }],
    'no-console': 'off',
    'no-case-declarations': 'off',
    'no-useless-escape': 'off',
    'require-yield': 'off',
    'no-dupe-class-members': 'off',
    'no-empty': 'warn',
    'no-undef': 'warn'
  }
};
