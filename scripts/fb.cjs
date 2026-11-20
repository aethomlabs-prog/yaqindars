#!/usr/bin/env node
/* firebase-tools o'rami: VS Code terminalida VSCODE_CWD bo'lsa, firebase-tools o'zini «VS Code kengaytmasi» deb
 * o'ylab shablonlarni topa olmaydi. Shu o'zgaruvchini olib tashlab, firebase'ni ishga tushiramiz.
 * JAVA_HOME bo'lmasa va D:/yaqindars-tools/jdk da JDK bo'lsa — emulyatorlar uchun shuni ishlatamiz. */
const { spawnSync } = require("node:child_process");
const { existsSync, readdirSync } = require("node:fs");
const path = require("node:path");

const env = { ...process.env };
delete env.VSCODE_CWD;
const localJdk = "D:/yaqindars-tools/jdk";
if (!env.JAVA_HOME && existsSync(localJdk)) {
  const dir = readdirSync(localJdk).find((d) => d.startsWith("jdk-"));
  if (dir) {
    env.JAVA_HOME = path.join(localJdk, dir);
    env.PATH = path.join(env.JAVA_HOME, "bin") + path.delimiter + env.PATH;
  }
}
const bin = require.resolve("firebase-tools/lib/bin/firebase.js", { paths: [path.resolve(__dirname, "..")] });
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: "inherit", env });
process.exit(r.status ?? 1);
