module.exports = {
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:jest/recommended"
    ],
    parser: "@typescript-eslint/parser", // Specifies the ESLint parser
    ignorePatterns: ["*.js"],
    rules: {
        "prefer-const": ["error", { destructuring: "all" }],
        "@typescript-eslint/no-non-null-assertion": "off"
    }
};
