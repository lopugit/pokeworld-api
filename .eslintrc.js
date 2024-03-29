module.exports = {
	env: {
		commonjs: true,
		es2021: true,
		node: true,
	},
	extends: [
		'xo',
	],
	parserOptions: {
		ecmaVersion: 12,
	},
	rules: {
		semi: 'off',
		'no-await-in-loop': 'off',
		'padded-blocks': 'off',
		'object-curly-spacing': [2, 'always'],
		'capitalized-comments': 'off',
		complexity: 'off',
		'max-depth': 'off',
		'no-async-promise-executor': 'off',
		'default-param-last': 'off',
		'max-params': 'off',
	},
}
