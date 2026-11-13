// Đóng gói KanbanRelay.exe bằng Node Single Executable Application (SEA).
// Chạy (Windows, Node 20+):  node kanban-relay/exe/build.cjs
// Cần postject (npm i -D postject, hoặc npx tự tải). Kết quả: kanban-relay/exe/dist/KanbanRelay.exe
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const here = __dirname;
const dist = path.join(here, "dist");
fs.mkdirSync(dist, { recursive: true });

// 1. Ghép server.mjs (ESM) vào setup.cjs dưới dạng CommonJS
let server = fs.readFileSync(path.join(here, "..", "server.mjs"), "utf8");
const rep = (re, to) => {
  if (!re.test(server)) throw new Error("Không tìm thấy trong server.mjs: " + re);
  server = server.replace(re, to);
};
rep(/^import http from "node:http";$/m, 'const http = require("node:http");');
rep(/^import fs from "node:fs";$/m, 'const fs = require("node:fs");');
rep(/^import \{ fileURLToPath \} from "node:url";$/m, 'const path = require("node:path");');
server = server.replace(/fileURLToPath\(new URL\("\.\/([^"]+)", import\.meta\.url\)\)/g, (_, f) => `path.join(BASE_DIR, ${JSON.stringify(f)})`);
if (/import\.meta|^import /m.test(server)) throw new Error("server.mjs còn cú pháp ESM chưa chuyển");
const setup = fs.readFileSync(path.join(here, "setup.cjs"), "utf8");
if (setup.indexOf("/*__SERVER__*/") < 0) throw new Error("setup.cjs thiếu /*__SERVER__*/");
// Giá trị điền sẵn: exe/defaults.env (KEY=VALUE: PLANNING_URL, PORT, KC_TOKEN_URL, KC_CLIENT_ID, KC_CLIENT_SECRET).
// Người build tự điền; file không đưa lên GitHub. Không có file thì dùng mặc định trong setup.cjs.
const defaults = {};
const defFile = path.join(here, "defaults.env");
if (fs.existsSync(defFile)) {
  fs.readFileSync(defFile, "utf8").replace(/^﻿/, "").split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && m[2]) defaults[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
}
console.log("Giá trị điền sẵn:", Object.keys(defaults).join(", ") || "(mặc định)");   // chỉ in tên, không in giá trị
if (setup.indexOf("/*__DEFAULTS__*/{}") < 0) throw new Error("setup.cjs thiếu /*__DEFAULTS__*/{}");
const bundle = path.join(dist, "kanban-relay-bundle.cjs");
fs.writeFileSync(bundle, setup.replace("/*__SERVER__*/", () => server).replace("/*__DEFAULTS__*/{}", () => JSON.stringify(defaults)));

// 2. Blob SEA
const cfg = path.join(dist, "sea-config.json");
fs.writeFileSync(cfg, JSON.stringify({ main: bundle, output: path.join(dist, "sea-prep.blob"), disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ["--experimental-sea-config", cfg], { stdio: "inherit" });

// 3. Chép node.exe, gắn blob
const exe = path.join(dist, "KanbanRelay.exe");
fs.copyFileSync(process.execPath, exe);
const postject = (() => {
  const local = path.join(here, "..", "..", "node_modules", "postject", "dist", "cli.js");
  return fs.existsSync(local) ? [process.execPath, [local]] : ["npx", ["--yes", "postject@1.0.0-alpha.6"]];
})();
execFileSync(postject[0], postject[1].concat([exe, "NODE_SEA_BLOB", path.join(dist, "sea-prep.blob"),
  "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", "--overwrite"]), { stdio: "inherit", shell: postject[0] === "npx" });
console.log("Đã tạo", exe, Math.round(fs.statSync(exe).size / 1048576) + " MB");
