module.exports = {
    roots: ["<rootDir>/src"],
    moduleDirectories: ["node_modules"],
    testTimeout: 10000,
    testEnvironment: "node",
    transform: {
        "^.+\\.(j|t)s$": "./jest-esbuild-transform",
    },
    transformIgnorePatterns: [
        "node_modules/(?!nanoid)"
    ],
}
