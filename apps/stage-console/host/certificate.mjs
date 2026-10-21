import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
export const addresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((x) => x && x.family === "IPv4" && !x.internal)
    .map((x) => x.address);
export function certificate(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const caKey = path.join(directory, "ca.key"),
    caPath = path.join(directory, "KYAA-Stage-CA.cer"),
    caPemPath = path.join(directory, "ca.pem"),
    keyPath = path.join(directory, "server.key"),
    certPath = path.join(directory, "server.pem");
  const run = (args) =>
    execFileSync("/usr/bin/openssl", args, { stdio: "pipe" });
  if (fs.existsSync(caKey) && !fs.existsSync(caPemPath)) {
    if (fs.readFileSync(caPath, "utf8").startsWith("-----BEGIN"))
      fs.copyFileSync(caPath, caPemPath);
    else run(["x509", "-inform", "DER", "-in", caPath, "-out", caPemPath]);
  }
  if (!fs.existsSync(caKey))
    run([
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      caKey,
      "-out",
      caPemPath,
      "-days",
      "365",
      "-subj",
      "/CN=KYAA Stage Local CA",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
    ]);
  run(["x509", "-in", caPemPath, "-outform", "DER", "-out", caPath]);
  const config = path.join(directory, "extensions.cnf");
  fs.writeFileSync(
    config,
    `subjectAltName=DNS:localhost,IP:127.0.0.1${addresses()
      .map((ip) => ",IP:" + ip)
      .join("")}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`,
  );
  run([
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    path.join(directory, "server.csr"),
    "-subj",
    "/CN=KYAA Stage",
  ]);
  run([
    "x509",
    "-req",
    "-in",
    path.join(directory, "server.csr"),
    "-CA",
    caPemPath,
    "-CAkey",
    caKey,
    "-CAcreateserial",
    "-out",
    certPath,
    "-days",
    "30",
    "-extfile",
    config,
  ]);
  fs.chmodSync(caKey, 0o600);
  fs.chmodSync(keyPath, 0o600);
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    caPath,
    ca: fs.readFileSync(caPemPath),
  };
}
