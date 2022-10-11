module.exports = {
    preset: "ts-jest",
    roots: ["<rootDir>/src"],
    moduleDirectories: ["node_modules"],
    testTimeout: 10000,
    testEnvironment: "node",
    transform: {
        ".tsx?$": ["ts-jest", { isolatedModules: true }],
    }
}
