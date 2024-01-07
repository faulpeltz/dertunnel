"use strict";
const esbuild = require("esbuild");

const transformer = {
    process(_content, filename, __) {
        const { code, map } = esbuild.transformSync(_content, {
            format: "cjs",
            platform: "node",
            target: "node20",
            minify: false,
            keepNames: true,
            sourcemap: true,
            sourcesContent: false,
            loader: "ts",
            sourcefile: filename,
        });
        return { code, map };
    },
};
module.exports = transformer;
