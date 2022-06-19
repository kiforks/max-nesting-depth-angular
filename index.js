'use strict';

const hasBlock = require('./utils/hasBlock');
const isStandardSyntaxRule = require('./utils/isStandardSyntaxRule');
const optionsMatches = require('./utils/optionsMatches');
const parser = require('postcss-selector-parser');
const report = require('./utils/report');
const ruleMessages = require('./utils/ruleMessages');
const validateOptions = require('./utils/validateOptions');
const { isAtRule, isDeclaration, isRoot, isRule } = require('./utils/typeGuards');
const { isNumber, isRegExp, isString } = require('./utils/validateTypes');
const stylelint = require('stylelint');

const ruleName = 'kiforks/max-nesting-depth';

const messages = ruleMessages(ruleName, {
	expected: (depth) => `Expected nesting depth to be no more than ${depth}`,
});

module.exports = stylelint.createPlugin(ruleName, (primary, secondaryOptions) => {
	/**
	 * @param {import('postcss').Node} node
	 */

	/**
	 * @param {import('postcss').Node} node
	 * @param {number} level
	 * @returns {number}
	 */
	function nestingDepth(node, level) {
		const parent = node.parent;

		if (parent == null) {
			throw new Error('The parent node must exist');
		}

		if (isIgnoreAtRule(parent)) {
			return 0;
		}

		// The nesting depth level's computation has finished
		// when this function, recursively called, receives
		// a node that is not nested -- a direct child of the
		// root node
		if (isRoot(parent) || (isAtRule(parent) && parent.parent && isRoot(parent.parent))) {
			return level;
		}

		/**
		 * @param {string} selector
		 */
		function containsPseudoClassesOnly(selector) {
			const normalized = parser().processSync(selector, { lossless: false });
			const selectors = normalized.split(',');

			return selectors.every((sel) => extractPseudoRule(sel));
		}

		/**
		 * @param {string[]} selectors
		 * @returns {boolean}
		 */
		function containsIgnoredPseudoClassesOnly(selectors) {
			if (!(secondaryOptions && secondaryOptions.ignorePseudo)) return false;

			return selectors.every((selector) => {
				const pseudoRule = extractPseudoRule(selector);

				if (!pseudoRule) return false;

				return optionsMatches(secondaryOptions, 'ignorePseudo', pseudoRule);
			});
		}

		if (
			(optionsMatches(secondaryOptions, 'ignore', 'blockless-at-rules') &&
				isAtRule(node) &&
				node.every((child) => !isDeclaration(child))) ||
			(optionsMatches(secondaryOptions, 'ignore', 'pseudo') &&
				isRule(node) &&
				containsPseudoClassesOnly(node.selector)) ||
			(isRule(node) && containsIgnoredPseudoClassesOnly(node.selectors))
		) {
			return nestingDepth(parent, level);
		}

		// Unless any of the conditions above apply, we want to
		// add 1 to the nesting depth level and then check the parent,
		// continuing to add and move up the hierarchy
		// until we hit the root node
		return nestingDepth(parent, level + 1);
	}

	const isIgnoreAtRule = (node) =>
		isAtRule(node) && optionsMatches(secondaryOptions, 'ignoreAtRules', node.name);

	return (root, result) => {
		const validOptions = validateOptions(
			result,
			ruleName,
			{
				actual: primary,
				possible: [isNumber],
			},
			{
				optional: true,
				actual: secondaryOptions,
				possible: {
					ignore: ['blockless-at-rules', 'pseudo'],
					ignoreAtRules: [isString, isRegExp],
					ignorePseudo: [isString, isRegExp],
				},
			},
		);

		if (!validOptions) return;

		root.walkRules(checkStatement);
		root.walkAtRules(checkStatement);

		/**
		 * @param {import('postcss').Rule | import('postcss').AtRule} statement
		 */
		function checkStatement(statement) {
			if (isIgnoreAtRule(statement)) {
				return;
			}

			if (!hasBlock(statement)) {
				return;
			}

			if (isRule(statement) && !isStandardSyntaxRule(statement)) {
				return;
			}

			const depth = nestingDepth(statement, 0);

			if (depth > primary) {
				report({
					ruleName,
					result,
					node: statement,
					message: messages.expected(primary),
				});
			}
		}
	};
});

/**
 * @param {string} selector
 * @returns {string | undefined}
 */
function extractPseudoRule(selector) {
	return selector.startsWith('&:') && selector.substr(2);
}

module.exports.ruleName = ruleName;
module.exports.messages = messages;
