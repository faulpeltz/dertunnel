import fs from "fs/promises";
import path from "path";
import { X509Certificate, createPrivateKey } from "crypto";
import acme from "acme-client";

import { dnsTextRecords } from "./dns-server";
import { elapsed, stopWatch } from "../shared/util";
import { AcmeCertInfo } from "../shared/models";

const CertFileName = "acme_tunnel.crt";
const CertKeyName = "acme_tunnel.key";

export type AcmeCert = { privateKey: string; cert: string; wasChanged: boolean };

export async function acmeCreateCertificates(baseDomain: string, acmeContactEmail: string): Promise<AcmeCert> {
    const client = new acme.Client({
        directoryUrl: acme.directory.letsencrypt.production,
        accountKey: await acme.crypto.createPrivateKey()
    });

    const [key, csr] = await acme.crypto.createCsr({
        commonName: `*.${baseDomain}`,
        altNames: [`*.${baseDomain}`]
    });

    const cert = await client.auto({
        challengePriority: ["dns-01"],
        csr,
        email: acmeContactEmail,
        termsOfServiceAgreed: true,
        async challengeCreateFn(authz, challenge, keyAuthorization) {
            if (challenge.type === "dns-01") {
                dnsTextRecords.set(`_acme-challenge.${authz.identifier.value}`, keyAuthorization);
            }
        },
        async challengeRemoveFn(authz, challenge) {
            if (challenge.type === "dns-01") {
                dnsTextRecords.delete(`_acme-challenge.${authz.identifier.value}`);
            }
        }
    });

    return { privateKey: key.toString(), cert, wasChanged: true }
}

let prevCertResult: AcmeCert | undefined;

export async function acmeLoadOrCreateCertificates(certDir: string, baseDomain: string, acmeContactEmail: string): Promise<AcmeCert> {
    const CertWiggleTime = 1_209_600_000; // 2 weeks in ms

    const sw = stopWatch();
    const certFile = path.join(certDir, CertFileName);
    const keyFile = path.join(certDir, CertKeyName);

    try {
        let certData: string, keyData: string;
        try {
            certData = await fs.readFile(certFile, "utf8");
            keyData = await fs.readFile(keyFile, "utf8");
        }
        catch (err) {
            throw new Error("Certificate file or key missing");
        }

        const cert = new X509Certificate(certData);
        if (!cert.checkHost(`service.${baseDomain}`)) {
            throw new Error("Certificate does not match configured base domain");
        }

        if (new Date(cert.validTo).valueOf() - CertWiggleTime < new Date().valueOf()) {
            throw new Error("Certificate is expired or is about to expire");
        }

        const key = createPrivateKey(keyData);
        if (key.type === "public") {
            throw new Error("Invalid key file - missing private key");
        }

        // if cert and key are still good - advise to do nothing
        if (prevCertResult?.cert === certData &&
            prevCertResult.privateKey === keyData) {
            return { ...prevCertResult, wasChanged: false };
        }

        console.log(`Certificate loaded from '${certFile}' is valid to ${cert.validTo}`);
        console.log(`Certificate issued by '${cert.issuer.replace(/\s/gm, " ")}'`);
        return prevCertResult = { cert: certData, privateKey: keyData, wasChanged: true }
    }
    catch (err) {
        console.log("Certificate error: " + (err as Error).message);
        try {
            console.log("Attempting to renew certificates using ACME DNS-01");
            const result = await acmeCreateCertificates(baseDomain, acmeContactEmail);
            try { await fs.mkdir(certDir); } catch { /* ignore */ }
            await fs.writeFile(certFile, result.cert);
            await fs.writeFile(keyFile, result.privateKey);
            await fs.chmod(keyFile, 0o600);
            console.log(`ACME success (${elapsed(sw)}ms)`);
            return prevCertResult = result;
        }
        catch (err) {
            throw new Error("Failed to create certificates using ACME: " + (err as Error).message);
        }
    }
}

export async function acmeGetCertificateInfo(certDir: string, baseDomain: string): Promise<AcmeCertInfo> {
    const certFile = path.join(certDir, CertFileName);

    try {
        let certData: string;
        try {
            certData = await fs.readFile(certFile, "utf8");
        }
        catch (err) {
            throw new Error("Certificate file or key missing");
        }

        const cert = new X509Certificate(certData);
        if (!cert.checkHost(`service.${baseDomain}`)) {
            throw new Error("Certificate does not match configured base domain");
        }

        if (new Date(cert.validTo).valueOf() < new Date().valueOf()) {
            throw new Error("Certificate is expired or is about to expire");
        }

        return {
            valid: true,
            expires: new Date(cert.validTo),
            issuer: cert.issuer.replace(/\s/gm, " ")
        };
    }
    catch (err) {
        return {
            valid: false,
            error: (err as Error).message,
        };
    }
}
