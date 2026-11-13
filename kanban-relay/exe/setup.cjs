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
// Giá trị điền sẵn trong cửa sổ cài đặt (người cài chỉ cần nhập tên đăng nhập + mật khẩu). Server planning, token URL,
// client ID lấy theo cấu hình của ứng dụng planning; client secret (và giá trị khác) do người build đặt trong
// exe/defaults.env lúc build (file không đưa lên GitHub) — xem build.cjs.
const DEFAULTS = Object.assign({
  PLANNING_URL: "http://14.241.68.10:3000", PORT: "8765",
  KC_TOKEN_URL: "http://14.241.68.10:8800/auth/realms/QLSX/protocol/openid-connect/token",
  KC_CLIENT_ID: "planning_react", KC_CLIENT_SECRET: ""
}, /*__DEFAULTS__*/{});
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
  let text;
  try {
    const buf = fs.readFileSync(file);
    text = buf[0] === 0xff && buf[1] === 0xfe ? buf.slice(2).toString("utf16le") : buf.toString("utf8").replace(/^﻿/, "");
  } catch { return env; }
  text.split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Za-z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1].toUpperCase()] = m[2].replace(/^["']|["']$/g, "");
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

/* ---------- Cửa sổ cài đặt (WinForms qua PowerShell có sẵn trong Windows) ---------- */
function powershell(script, env) {
  const { spawnSync } = require("node:child_process");
  const enc = Buffer.from("[Console]::OutputEncoding=[Text.Encoding]::UTF8\n" + script, "utf16le").toString("base64");
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-EncodedCommand", enc],
    { env: Object.assign({}, process.env, env), encoding: "utf8", windowsHide: false, maxBuffer: 1 << 20 });
  if (r.status !== 0) throw new Error((r.stderr || "").trim() || `powershell ${r.status}`);
  return (r.stdout || "").trim();
}

const FORM_PS = String.raw`
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$f = New-Object Windows.Forms.Form
$f.Text = 'Cài đặt Kanban relay'; $f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedDialog'
$f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.TopMost = $true
$f.Font = New-Object Drawing.Font('Segoe UI', 10); $f.ClientSize = New-Object Drawing.Size(520, 470)
$y = 14
function Head($t) { $l = New-Object Windows.Forms.Label; $l.Text = $t; $l.Font = New-Object Drawing.Font('Segoe UI', 10, [Drawing.FontStyle]::Bold)
  $l.ForeColor = [Drawing.Color]::FromArgb(11, 69, 150); $l.Location = New-Object Drawing.Point(16, $script:y); $l.AutoSize = $true; $f.Controls.Add($l); $script:y += 28 }
function Field($label, $value, $secret, $hint) {
  $l = New-Object Windows.Forms.Label; $l.Text = $label; $l.Location = New-Object Drawing.Point(16, ($script:y + 3)); $l.Size = New-Object Drawing.Size(170, 22); $f.Controls.Add($l)
  $t = New-Object Windows.Forms.TextBox; $t.Location = New-Object Drawing.Point(190, $script:y); $t.Size = New-Object Drawing.Size(310, 24); $t.Text = $value
  if ($secret) { $t.UseSystemPasswordChar = $true }
  $f.Controls.Add($t)
  if ($hint) { $h = New-Object Windows.Forms.Label; $h.Text = $hint; $h.ForeColor = [Drawing.Color]::Gray; $h.Font = New-Object Drawing.Font('Segoe UI', 8)
    $h.Location = New-Object Drawing.Point(190, ($script:y + 26)); $h.AutoSize = $true; $f.Controls.Add($h); $script:y += 16 }
  $script:y += 34; return $t }
Head 'Tài khoản để relay đọc số liệu'
$user = Field 'Tên đăng nhập' $env:KR_USER $false ''
$keepPass = if ($env:KR_HAS_PASS -eq '1') { 'Để trống = giữ như cũ' } else { '' }
$pass = Field 'Mật khẩu' '' $true $keepPass
$show = New-Object Windows.Forms.CheckBox; $show.Text = 'Hiện mật khẩu'; $show.Location = New-Object Drawing.Point(190, $y); $show.AutoSize = $true
$f.Controls.Add($show)
$y += 34
# Cấu hình nâng cao: đã điền sẵn, thường không phải sửa (mở ra khi thiếu thông tin)
$adv = New-Object Windows.Forms.LinkLabel; $adv.Text = 'Cấu hình nâng cao ▸'; $adv.Location = New-Object Drawing.Point(16, $y); $adv.AutoSize = $true
$f.Controls.Add($adv)
$y += 30
$advTop = $y
$panel = @()
function AdvField($label, $value, $secret, $hint) { $before = @($f.Controls); $t = Field $label $value $secret $hint
  $script:panel += @($f.Controls | Where-Object { $before -notcontains $_ }); return $t }
$planning = AdvField 'Server planning' $env:KR_PLANNING $false ''
$port = AdvField 'Cổng relay' $env:KR_PORT $false 'Kanban / TV trỏ về http://<IP máy này>:<cổng>'
$tokenUrl = AdvField 'Keycloak token URL' $env:KR_TOKEN_URL $false 'Dạng http://<máy>:<cổng>/auth/realms/<realm>/protocol/openid-connect/token'
$client = AdvField 'Client ID' $env:KR_CLIENT_ID $false ''
$keepSecret = if ($env:KR_HAS_SECRET -eq '1') { 'Đã có sẵn — để trống = giữ nguyên' } else { 'Lấy từ người quản trị Keycloak' }
$secret = AdvField 'Client secret' '' $true $keepSecret
$advBottom = $y
$show.Add_CheckedChanged({ $secret.UseSystemPasswordChar = -not $show.Checked; $pass.UseSystemPasswordChar = -not $show.Checked })
$ok = New-Object Windows.Forms.Button; $ok.Text = 'Cài đặt'; $ok.Size = New-Object Drawing.Size(120, 34)
$ok.BackColor = [Drawing.Color]::FromArgb(232, 131, 58); $ok.ForeColor = [Drawing.Color]::White; $ok.FlatStyle = 'Flat'
$cancel = New-Object Windows.Forms.Button; $cancel.Text = 'Hủy'; $cancel.Size = New-Object Drawing.Size(120, 34)
$cancel.DialogResult = 'Cancel'; $f.CancelButton = $cancel; $f.AcceptButton = $ok
$f.Controls.Add($ok); $f.Controls.Add($cancel)
function Layout($open) {
  $panel | ForEach-Object { $_.Visible = $open }
  $adv.Text = if ($open) { 'Cấu hình nâng cao ▾' } else { 'Cấu hình nâng cao ▸' }
  $by = if ($open) { $advBottom + 6 } else { $advTop + 6 }
  $ok.Location = New-Object Drawing.Point(250, $by); $cancel.Location = New-Object Drawing.Point(380, $by)
  $f.ClientSize = New-Object Drawing.Size(520, ($by + 50)) }
$adv.Add_LinkClicked({ Layout (-not $planning.Visible) })
$needAdv = (-not $env:KR_TOKEN_URL) -or (-not $env:KR_CLIENT_ID) -or ($env:KR_HAS_SECRET -ne '1')
Layout $needAdv
$ok.Add_Click({
  $miss = @()
  if (-not $user.Text.Trim()) { $miss += 'Tên đăng nhập' }
  if (-not $pass.Text -and $env:KR_HAS_PASS -ne '1') { $miss += 'Mật khẩu' }
  $advMiss = @()
  if (-not $planning.Text.Trim()) { $advMiss += 'Server planning' }
  if (-not ($port.Text.Trim() -match '^\d+$')) { $advMiss += 'Cổng relay (số)' }
  if (-not ($tokenUrl.Text.Trim() -match '^https?://.+/protocol/openid-connect/token$')) { $advMiss += 'Keycloak token URL (địa chỉ đầy đủ)' }
  if (-not $client.Text.Trim()) { $advMiss += 'Client ID' }
  if (-not $secret.Text -and $env:KR_HAS_SECRET -ne '1') { $advMiss += 'Client secret' }
  if ($advMiss.Count) { Layout $true }
  $miss += $advMiss
  if ($miss.Count) { [Windows.Forms.MessageBox]::Show("Còn thiếu / chưa đúng: " + ($miss -join ', '), 'Kanban relay', 'OK', 'Warning') | Out-Null; return }
  $f.DialogResult = 'OK'; $f.Close() })
$f.ShowInTaskbar = $true; $f.Add_Shown({ $f.Activate(); $f.BringToFront() })
if ($f.ShowDialog() -ne 'OK') { 'null'; exit 0 }
@{ planning = $planning.Text.Trim(); port = $port.Text.Trim(); tokenUrl = $tokenUrl.Text.Trim(); clientId = $client.Text.Trim()
   secret = $secret.Text; user = $user.Text.Trim(); pass = $pass.Text } | ConvertTo-Json -Compress
`;

// Mở cửa sổ nhập cấu hình + tài khoản; null = bấm Hủy. Ô bí mật để trống = giữ giá trị cũ.
function formInput(cur, tok) {
  const secretDef = tok.KC_CLIENT_SECRET || DEFAULTS.KC_CLIENT_SECRET || "";
  const out = powershell(FORM_PS, {
    KR_PLANNING: cur.PLANNING_URL || DEFAULTS.PLANNING_URL, KR_PORT: cur.PORT || DEFAULTS.PORT,
    KR_TOKEN_URL: tok.KC_TOKEN_URL || DEFAULTS.KC_TOKEN_URL, KR_CLIENT_ID: tok.KC_CLIENT_ID || DEFAULTS.KC_CLIENT_ID,
    KR_USER: tok.KC_USERNAME || "",
    KR_HAS_SECRET: secretDef ? "1" : "0", KR_HAS_PASS: tok.KC_PASSWORD ? "1" : "0"
  });
  const v = JSON.parse(out || "null");
  if (!v) return null;
  return {
    planning: v.planning, port: v.port, tokenUrl: v.tokenUrl, clientId: v.clientId, user: v.user,
    secret: v.secret || secretDef, pass: v.pass || tok.KC_PASSWORD || ""
  };
}

// Hộp thông báo kết quả (chữ có thể chọn / chép)
function messageBox(text, ok) {
  try {
    powershell(String.raw`
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$f = New-Object Windows.Forms.Form; $f.Text = 'Kanban relay'; $f.StartPosition = 'CenterScreen'; $f.TopMost = $true
$f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false
$f.Font = New-Object Drawing.Font('Segoe UI', 10); $f.ClientSize = New-Object Drawing.Size(520, 300)
$t = New-Object Windows.Forms.TextBox; $t.Multiline = $true; $t.ReadOnly = $true; $t.BorderStyle = 'None'; $t.BackColor = $f.BackColor
$t.Location = New-Object Drawing.Point(16, 16); $t.Size = New-Object Drawing.Size(488, 230); $t.Text = $env:KR_MSG
if ($env:KR_OK -ne '1') { $t.ForeColor = [Drawing.Color]::FromArgb(179, 38, 30) }
$b = New-Object Windows.Forms.Button; $b.Text = 'Đóng'; $b.Size = New-Object Drawing.Size(120, 34); $b.Location = New-Object Drawing.Point(384, 254)
$b.DialogResult = 'OK'; $f.AcceptButton = $b; $f.Controls.Add($t); $f.Controls.Add($b); $f.ActiveControl = $b
$f.ShowInTaskbar = $true; $f.Add_Shown({ $f.Activate(); $f.BringToFront() })
$f.ShowDialog() | Out-Null`, { KR_MSG: text.replace(/\n/g, "\r\n"), KR_OK: ok ? "1" : "0" });
  } catch { /* không có giao diện: đã in ra cửa sổ dòng lệnh */ }
}

// Thử lấy token bằng tài khoản vừa nhập; trả về "" nếu được, hoặc lý do lỗi (không chứa mật khẩu)
async function tryLogin(v) {
  try {
    const res = await fetch(v.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", client_id: v.clientId, client_secret: v.secret, username: v.user, password: v.pass }),
      signal: AbortSignal.timeout(15000)
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.access_token) return "";
    return body.error_description || body.error || `HTTP ${res.status}`;
  } catch (e) {
    return `Không kết nối được tới ${v.tokenUrl} (${e.cause && e.cause.code || e.name || e.message})`;
  }
}

/* ---------- Cài đặt ---------- */
async function setup(rl) {
  console.log("\n=== Cài đặt Kanban relay ===\n");
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  const envFile = path.join(INSTALL_DIR, "relay.env"), tokFile = path.join(INSTALL_DIR, ".env.token");
  // File tài khoản / cấu hình đặt sẵn cạnh exe (cùng định dạng harness/.env.token): cài luôn, không hỏi gì
  const presetTok = readEnv(path.join(HERE, ".env.token")), presetEnv = readEnv(path.join(HERE, "relay.env"));
  const cur = Object.assign(readEnv(envFile), presetEnv), tok = Object.assign(readEnv(tokFile), presetTok);
  const KEYS = ["KC_TOKEN_URL", "KC_CLIENT_ID", "KC_CLIENT_SECRET", "KC_USERNAME", "KC_PASSWORD"];
  const auto = !has("--setup") && KEYS.every(k => presetTok[k]);
  const allow = cur.ALLOW_ORIGIN || "*";
  let v;
  if (auto) {
    console.log(`Dùng tài khoản trong ${path.join(HERE, ".env.token")} — không cần nhập.\n`);
    v = { planning: cur.PLANNING_URL || "http://14.241.68.10:3000", port: cur.PORT || "8765", tokenUrl: tok.KC_TOKEN_URL,
      clientId: tok.KC_CLIENT_ID, secret: tok.KC_CLIENT_SECRET, user: tok.KC_USERNAME, pass: tok.KC_PASSWORD };
  } else {
    // Cửa sổ cài đặt; không mở được (máy không có giao diện / --console) thì hỏi trong cửa sổ dòng lệnh
    let gui = !has("--console");
    if (gui) {
      console.log("Nhập cấu hình và tài khoản trong cửa sổ cài đặt...");
      // Thử đăng nhập ngay; sai thì báo lỗi và mở lại cửa sổ (giữ các ô đã nhập, trừ ô bí mật)
      for (;;) {
        try { v = formInput(cur, tok); } catch (e) { console.log("Không mở được cửa sổ cài đặt:", e.message); gui = false; break; }
        if (!v) { console.log("Đã huỷ cài đặt."); return; }
        console.log("Đang thử đăng nhập...");
        const err = await tryLogin(v);
        if (!err) { console.log("Đăng nhập được."); break; }
        console.log("Không đăng nhập được:", err);
        messageBox(`Không đăng nhập được bằng tài khoản vừa nhập:\n\n${err}\n\nBấm Đóng để nhập lại.`, false);
        Object.assign(cur, { PLANNING_URL: v.planning, PORT: v.port });
        Object.assign(tok, { KC_TOKEN_URL: v.tokenUrl, KC_CLIENT_ID: v.clientId, KC_USERNAME: v.user, KC_CLIENT_SECRET: "", KC_PASSWORD: "" });
      }
    }
    if (!gui) {
      console.log("1) Server planning");
      const planning = await ask(rl, "   Địa chỉ server planning (PLANNING_URL)", cur.PLANNING_URL || "http://14.241.68.10:3000");
      const port = await ask(rl, "   Cổng relay", cur.PORT || "8765");
      console.log("\n2) Tài khoản để relay đọc số liệu (nên dùng tài khoản chỉ có quyền đọc)");
      const tokenUrl = await ask(rl, "   Keycloak token URL (KC_TOKEN_URL)", tok.KC_TOKEN_URL || "");
      const clientId = await ask(rl, "   Client ID", tok.KC_CLIENT_ID || "");
      const secret = await ask(rl, "   Client secret", tok.KC_CLIENT_SECRET || "", true);
      const user = await ask(rl, "   Tên đăng nhập", tok.KC_USERNAME || "");
      const pass = await ask(rl, "   Mật khẩu", tok.KC_PASSWORD || "", true);
      v = { planning, port, tokenUrl, clientId, secret, user, pass };
    }
  }
  const { planning, port, tokenUrl, clientId, secret, user, pass } = v;

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
  const result = h && h.ok ? "✔ Đã cài xong. Relay đang chạy và đã đăng nhập được."
    : h ? `✖ Relay đã chạy nhưng chưa đăng nhập được: ${h.tokenError || "?"}\nKiểm tra lại tài khoản: chạy lại KanbanRelay.exe --setup.`
      : `✖ Chưa thấy relay trả lời. Xem log: ${path.join(INSTALL_DIR, "relay.log")}`;
  console.log("   " + result);
  printAddresses(port);
  console.log("  Gửi địa chỉ trên để cấu hình Kanban / TV trỏ về máy này.");
  const list = ips();
  messageBox([
    result, "",
    "Địa chỉ để Kanban / TV trỏ về (gửi địa chỉ này đi):",
    ...(list.length ? list.map(ip => `    http://${ip}:${port}`) : [`    http://<IP máy này>:${port}`]),
    "",
    `Tự chạy khi bật máy: ${okTask ? "có" : "LỖI"}   ·   Tường lửa cổng ${port}: ${okFw ? "đã mở" : "LỖI"}`,
    `Thư mục cài: ${INSTALL_DIR}`,
    "Xem trạng thái: bấm đúp C:\\KanbanRelay\\KanbanRelay.exe"
  ].join("\n"), !!(h && h.ok));
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
  return h;
}

// Mở lại cửa sổ cài đặt (tự xin quyền Administrator nếu cần)
async function reSetup(rl) {
  if (isAdmin()) { await setup(rl); return; }
  try {
    spawn("powershell", ["-NoProfile", "-Command",
      `Start-Process -FilePath '${SELF.replace(/'/g, "''")}' -ArgumentList '--setup' -Verb RunAs`],
    { stdio: "ignore", detached: true }).unref();
  } catch { console.log("Chuột phải KanbanRelay.exe → Run as administrator, rồi chạy lại."); }
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
      const h = await status(rl);
      // Chưa đăng nhập được, hoặc đang chạy bản exe mới (ngoài thư mục cài): mời cài lại / cập nhật
      const outside = path.resolve(SELF).toLowerCase() !== path.resolve(path.join(INSTALL_DIR, EXE_NAME)).toLowerCase();
      const why = h && !h.ok ? "Relay chưa đăng nhập được." : !h ? "Relay chưa chạy." : outside ? "Đây là bản exe khác với bản đã cài." : "";
      if (why && IS_SEA && !rl.closed) {
        const a = await ask(rl, `\n  ${why} Mở cửa sổ cài đặt lại${outside ? " (cập nhật bản này vào C:\\KanbanRelay)" : ""}? (C/k)`, "C");
        if (/^c/i.test(a)) { await reSetup(rl); return; }
      }
    }
    await pause(rl);
  } finally {
    rl.close();
  }
})();
