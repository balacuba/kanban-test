// KanbanRelay.exe — cài đặt và chạy Kanban relay trên Windows (đóng gói bằng Node SEA, xem build.cjs).
//
//   Bấm đúp KanbanRelay.exe      → lần đầu: hỏi cấu hình + tài khoản, cài vào C:\KanbanRelay, cho tự chạy khi bật máy,
//                                  mở cổng tường lửa, chạy relay. Đã cài: hiện trạng thái + địa chỉ IP để Kanban/TV trỏ về.
//   KanbanRelay.exe --run        → chạy relay trong cửa sổ này (xem log trực tiếp)
//   KanbanRelay.exe --service    → chạy nền (Task Scheduler gọi), log ghi vào relay.log
//   KanbanRelay.exe --setup      → sửa lại cấu hình / tài khoản
//   KanbanRelay.exe --uninstall  → gỡ tự chạy + luật tường lửa (giữ thư mục cài)
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const readline = require("node:readline");
const { execFileSync, spawn } = require("node:child_process");

const INSTALL_DIR = process.env.KANBAN_RELAY_DIR || "C:\\KanbanRelay";
const EXE_NAME = "KanbanRelay.exe";
const TASK = "Kanban relay";
const IS_SEA = (() => { try { return require("node:sea").isSea(); } catch { return false; } })();
const SELF = IS_SEA ? process.execPath : __filename;
const HERE = path.dirname(SELF);
const args = process.argv.slice(2).map(a => String(a).toLowerCase());
const has = f => args.indexOf(f) >= 0;

/* ---------- Relay (nội dung server.mjs, chuyển sang CommonJS lúc build) ---------- */
let BASE_DIR = HERE;
function runServer() {
/*__SERVER__*/
}

/* ---------- Tiện ích ---------- */
const readEnv = file => {
  const env = {};
  if (!fs.existsSync(file)) return env;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
  return env;
};
const ips = () => {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(n => {
    if (n.family === "IPv4" && !n.internal && !/^169\.254\./.test(n.address)) out.push(n.address);
  }));
  return out;
};
const isAdmin = () => { try { execFileSync("net", ["session"], { stdio: "ignore" }); return true; } catch { return false; } };
const run = (cmd, a) => { try { execFileSync(cmd, a, { stdio: "ignore" }); return true; } catch { return false; } };

function ask(rl, q, def = "", hidden = false) {
  return new Promise(resolve => {
    if (rl.closed) { resolve(def); return; }   // không có bàn phím (stdin đã đóng)
    const prompt = def ? `${q} [${hidden ? "giữ nguyên" : def}]: ` : `${q}: `;
    if (!hidden) { rl.question(prompt, a => resolve(a.trim() || def)); return; }
    // Nhập mật khẩu: không hiện ký tự
    const out = rl.output;
    rl._writeToOutput = s => { if (s.includes(prompt)) out.write(prompt); else out.write(""); };
    rl.question(prompt, a => { rl._writeToOutput = s => out.write(s); out.write("\n"); resolve(a || def); });
  });
}
const pause = async (rl, msg = "Bấm Enter để đóng") => { await ask(rl, msg); };

function printAddresses(port) {
  console.log("\n  Địa chỉ để Kanban / TV trỏ về (KANBAN_RELAY_URL):");
  const list = ips();
  if (!list.length) console.log(`    http://<IP máy này>:${port}`);
  list.forEach(ip => console.log(`    http://${ip}:${port}`));
  console.log(`  Kiểm tra: http://localhost:${port}/health\n`);
}

async function health(port) {
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    return await res.json();
  } catch { return null; }
}

/* ---------- Cài đặt ---------- */
async function setup(rl) {
  console.log("\n=== Cài đặt Kanban relay ===\n");
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  const envFile = path.join(INSTALL_DIR, "relay.env"), tokFile = path.join(INSTALL_DIR, ".env.token");
  const cur = readEnv(envFile), tok = readEnv(tokFile);

  console.log("1) Server planning");
  const planning = await ask(rl, "   Địa chỉ server planning (PLANNING_URL)", cur.PLANNING_URL || "http://14.241.68.10:3000");
  const port = await ask(rl, "   Cổng relay", cur.PORT || "8765");
  const allow = await ask(rl, "   Trang được phép nghe (ALLOW_ORIGIN, * = mọi trang)", cur.ALLOW_ORIGIN || "*");

  console.log("\n2) Tài khoản để relay đọc số liệu (nên dùng tài khoản chỉ có quyền đọc)");
  const tokenUrl = await ask(rl, "   Keycloak token URL (KC_TOKEN_URL)", tok.KC_TOKEN_URL || "");
  const clientId = await ask(rl, "   Client ID", tok.KC_CLIENT_ID || "");
  const secret = await ask(rl, "   Client secret", tok.KC_CLIENT_SECRET || "", true);
  const user = await ask(rl, "   Tên đăng nhập", tok.KC_USERNAME || "");
  const pass = await ask(rl, "   Mật khẩu", tok.KC_PASSWORD || "", true);

  fs.writeFileSync(envFile, [
    "# Cấu hình Kanban relay (sửa xong chạy lại: KanbanRelay.exe --setup, hoặc khởi động lại máy)",
    `PLANNING_URL=${planning}`, `PORT=${port}`, `APP_ORIGIN=${cur.APP_ORIGIN || ""}`, `ALLOW_ORIGIN=${allow}`,
    `POLL_MS=${cur.POLL_MS || "3000"}`, ""
  ].join("\r\n"));
  fs.writeFileSync(tokFile, [
    "# Tài khoản của Kanban relay — không gửi file này cho ai",
    `KC_TOKEN_URL=${tokenUrl}`, `KC_CLIENT_ID=${clientId}`, `KC_CLIENT_SECRET=${secret}`,
    `KC_USERNAME=${user}`, `KC_PASSWORD=${pass}`, ""
  ].join("\r\n"));
  // Chỉ Administrators và SYSTEM đọc được file tài khoản
  run("icacls", [tokFile, "/inheritance:r", "/grant:r", "*S-1-5-32-544:F", "*S-1-5-18:F"]);

  // Chép exe vào thư mục cài
  const target = path.join(INSTALL_DIR, EXE_NAME);
  if (IS_SEA && path.resolve(SELF).toLowerCase() !== path.resolve(target).toLowerCase()) {
    run("schtasks", ["/end", "/tn", TASK]);
    try { fs.copyFileSync(SELF, target); } catch (e) { console.log(`   Không chép được exe vào ${target}: ${e.message}`); }
  }

  console.log("\n3) Tự chạy khi bật máy + mở cổng tường lửa");
  const okTask = run("schtasks", ["/create", "/tn", TASK, "/tr", `"${target}" --service`, "/sc", "onstart", "/ru", "SYSTEM", "/rl", "HIGHEST", "/f"]);
  run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${TASK}`]);
  const okFw = run("netsh", ["advfirewall", "firewall", "add", "rule", `name=${TASK}`, "dir=in", "action=allow", "protocol=TCP", `localport=${port}`]);
  console.log(`   Tự chạy khi bật máy: ${okTask ? "đã cài" : "LỖI"}   Tường lửa cổng ${port}: ${okFw ? "đã mở" : "LỖI"}`);
  run("schtasks", ["/end", "/tn", TASK]);
  const okRun = run("schtasks", ["/run", "/tn", TASK]);
  console.log(`   Chạy relay nền: ${okRun ? "đã chạy" : "LỖI"}`);

  console.log("\n   Đang kiểm tra...");
  let h = null;
  for (let i = 0; i < 10 && !(h && h.ok); i++) { await new Promise(r => setTimeout(r, 1500)); h = await health(port); }
  if (h && h.ok) console.log("   ✔ Relay đang chạy và đã lấy được token.");
  else if (h) console.log(`   ✖ Relay chạy nhưng chưa lấy được token: ${h.tokenError || "?"} — kiểm tra lại tài khoản (KanbanRelay.exe --setup).`);
  else console.log(`   ✖ Chưa thấy relay trả lời. Xem log: ${path.join(INSTALL_DIR, "relay.log")}`);
  printAddresses(port);
  console.log("  Gửi địa chỉ trên để cấu hình Kanban / TV trỏ về máy này.");
}

async function status(rl) {
  const env = readEnv(path.join(INSTALL_DIR, "relay.env"));
  const port = env.PORT || "8765";
  console.log("\n=== Kanban relay ===");
  console.log(`  Thư mục cài: ${INSTALL_DIR}`);
  console.log(`  Server planning: ${env.PLANNING_URL || "?"}`);
  const h = await health(port);
  if (!h) console.log("  Trạng thái: CHƯA CHẠY (khởi động lại máy, hoặc chạy KanbanRelay.exe --run để xem lỗi)");
  else {
    console.log(`  Trạng thái: đang chạy, token ${h.ok ? "OK" : "LỖI: " + (h.tokenError || "?")}`);
    console.log(`  Kanban đang nghe: ${h.groups.reduce((a, g) => a + g.clients, 0)} (${h.groups.length} nhóm WO)`);
  }
  printAddresses(port);
  console.log("  Sửa cấu hình: KanbanRelay.exe --setup   ·   Gỡ: KanbanRelay.exe --uninstall");
}

function uninstall() {
  run("schtasks", ["/end", "/tn", TASK]);
  const a = run("schtasks", ["/delete", "/tn", TASK, "/f"]);
  const b = run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${TASK}`]);
  console.log(`Gỡ tự chạy: ${a ? "xong" : "không có / lỗi"} · Gỡ luật tường lửa: ${b ? "xong" : "không có / lỗi"}`);
  console.log(`Thư mục ${INSTALL_DIR} (cấu hình, tài khoản, log) vẫn giữ — xoá tay nếu không dùng nữa.`);
}

/* ---------- Chạy relay ---------- */
function startRelay(toLog) {
  BASE_DIR = fs.existsSync(path.join(HERE, "relay.env")) ? HERE : INSTALL_DIR;
  if (toLog) {
    const logFile = path.join(BASE_DIR, "relay.log");
    try { if (fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, logFile + ".old"); } catch { /* chưa có log */ }
    const write = (...a) => { try { fs.appendFileSync(logFile, a.map(String).join(" ") + "\r\n"); } catch { /* bỏ qua */ } };
    console.log = write; console.error = write;
  }
  process.on("uncaughtException", e => { console.log("[lỗi]", e && e.stack || e); });
  runServer();
}

(async () => {
  if (has("--service")) { startRelay(true); return; }
  if (has("--run")) { startRelay(false); return; }
  if (process.platform !== "win32") { startRelay(false); return; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("close", () => { rl.closed = true; });
  try {
    if (has("--uninstall")) {
      if (!isAdmin()) console.log("Cần chạy bằng quyền Administrator (chuột phải → Run as administrator).");
      else uninstall();
    } else if (has("--setup") || !fs.existsSync(path.join(INSTALL_DIR, "relay.env"))) {
      if (!isAdmin()) {
        console.log("\nCài đặt cần quyền Administrator: chuột phải KanbanRelay.exe → Run as administrator.\n");
        // Tự mở lại bằng quyền Administrator
        const extra = has("--setup") ? "--setup" : "";
        try {
          spawn("powershell", ["-NoProfile", "-Command",
            `Start-Process -FilePath '${SELF.replace(/'/g, "''")}' ${extra ? `-ArgumentList '${extra}'` : ""} -Verb RunAs`],
          { stdio: "ignore", detached: true }).unref();
          rl.close();
          return;
        } catch { /* người dùng tự chạy lại */ }
      } else {
        await setup(rl);
      }
    } else {
      await status(rl);
    }
    await pause(rl);
  } finally {
    rl.close();
  }
})();
