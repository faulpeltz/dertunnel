const fs = require("fs");
const path = require("path");
const fork = require("child_process").fork;
(async () => {
    if (!process.argv.at(-1)) { console.error("Need output dir argument"); process.exit(1); }
    const outDir = process.argv.at(-1);
    try { fs.mkdirSync(outDir); } catch (err) { }

    const cp = fork("node_modules/license-compliance/bin/cli.js", ["-p", "-f", "json", "-r", "detailed"], { shell: true, stdio: "pipe" });
    const chunks = [];
    cp.stdout.on("data", x => chunks.push(x));
    cp.stderr.on("data", x => { });
    await new Promise(resolve => cp.once("exit", resolve));
    const stdout = Buffer.concat(chunks).toString("utf8");
    if (cp.exitCode !== 0) { throw new Error("Failed to invoke license-compliance: " + cp.stderr.toString()); }

    const licenses = JSON.parse(stdout);
    const licData = new Map();

    await Promise.all(licenses.map(lic => lic.licenseFile)
        .filter(f => f)
        .map(async file => {
            const content = (await fs.promises.readFile(file)).toString();
            licData.set(file, content);
        }));

    console.debug(`Exporting ${licenses.length} licenses`);

    const licStream = fs.createWriteStream(path.join(outDir, "LICENSES_bundled.txt"), { flags: 'w' });
    for (const lic of licenses) {
        let licText = licData.get(lic.licenseFile);
        if (!licText) {
            console.log(`Missing license for package: ${lic.name}, ${lic.repository}`);
            licText = "MISSING";
        }
        licStream.write("----------------------------------------------------------------------------------------------------\n");
        licStream.write(`NPM-Package: ${lic.name}\nVer: ${lic.version}\Source: (${lic.repository})\n\n`);
        licStream.write(licText);
        licStream.write("\n\n");
    }
    licStream.close();
})().catch(err => {
    console.error("Read license failed:", err);
    process.exit(1);
});
