// Kanban relay – máy chủ trung gian Server-Sent Events (SSE) cho Kanban HourlyOutputReport.
//
// Vấn đề: mỗi Kanban (trình duyệt, TV) tự hỏi server planning mỗi 5 giây; mở nhiều Kanban thì server bị hỏi gấp
// nhiều lần và hay trả 502. Relay hỏi server MỘT lần cho mỗi nhóm WO đang được xem (một yêu cầu nhẹ: bản ghi test
// mới nhất + số bản ghi), khi số liệu đổi thì đẩy sự kiện "update" cho mọi Kanban đang xem nhóm WO đó qua SSE.
// Kanban chỉ tải lại khi có số liệu mới. Relay không gửi số liệu sản xuất hay token xuống trình duyệt.
//
// Chạy: Node 18 trở lên, không cần cài thư viện.
//   PLANNING_URL=http://<server planning> node server.mjs
// Biến môi trường:
//   PLANNING_URL  (bắt buộc) địa chỉ server planning, vd. http://14.241.68.10:3000
//   PORT          cổng của relay, mặc định 8765
//   TOKEN_FILE    file tài khoản (mặc định .env.token cạnh server.mjs), cùng định dạng với harness/.env.token:
//                 KC_TOKEN_URL, KC_CLIENT_ID, KC_CLIENT_SECRET, KC_USERNAME, KC_PASSWORD — do người quản trị tự tạo.
//   APP_ORIGIN    Origin gửi kèm khi gọi server planning (server chỉ nhận từ địa chỉ của ứng dụng), mặc định PLANNING_URL
//   ALLOW_ORIGIN  địa chỉ trang được phép nghe SSE (CORS), mặc định * (mọi trang)
//   POLL_MS       chu kỳ kiểm tra số liệu mới, mặc định 3000
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Cấu hình: file relay.env cạnh server.mjs (KEY=VALUE, mỗi dòng một biến); biến môi trường đặt sẵn được ưu tiên.
// Chuyển relay sang máy khác / trỏ sang server planning khác: chỉ cần sửa relay.env rồi chạy lại.
const CONFIG_FILE = process.env.RELAY_CONFIG || fileURLToPath(new URL("./relay.env", import.meta.url));
if (fs.existsSync(CONFIG_FILE)) {
  fs.readFileSync(CONFIG_FILE, "utf8").split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  });
}

const PLANNING_URL = (process.env.PLANNING_URL || "").replace(/\/+$/, "");
if (!PLANNING_URL) { console.error("Thiếu PLANNING_URL (đặt trong relay.env hoặc biến môi trường)"); process.exit(1); }
const PORT = Number(process.env.PORT) || 8765;
const TOKEN_FILE = process.env.TOKEN_FILE || fileURLToPath(new URL("./.env.token", import.meta.url));
const APP_ORIGIN = process.env.APP_ORIGIN || PLANNING_URL;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const POLL_MS = Math.max(1000, Number(process.env.POLL_MS) || 3000);
const HEARTBEAT_MS = 15000;
const MAX_WOS = 200;

const log = (...a) => console.log(new Date().toLocaleTimeString("vi-VN"), ...a);

/* ---------- Token (Keycloak, grant_type=password), tự gia hạn ---------- */
const auth = { token: "", expiresAt: 0, error: "", timer: null };
function readTokenEnv() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const env = {};
  fs.readFileSync(TOKEN_FILE, "utf8").split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
  const need = ["KC_TOKEN_URL", "KC_CLIENT_ID", "KC_CLIENT_SECRET", "KC_USERNAME", "KC_PASSWORD"];
  return need.every(k => env[k]) ? env : null;
}
async function refreshToken() {
  clearTimeout(auth.timer);
  const env = readTokenEnv();
  if (!env) {
    auth.token = "";
    auth.error = fs.existsSync(TOKEN_FILE) ? "File tài khoản còn thiếu thông tin" : `Chưa có file tài khoản ${TOKEN_FILE}`;
    auth.timer = setTimeout(refreshToken, 30000);
    log("[token]", auth.error);
    return;
  }
  try {
    const res = await fetch(env.KC_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password", client_id: env.KC_CLIENT_ID, client_secret: env.KC_CLIENT_SECRET,
        username: env.KC_USERNAME, password: env.KC_PASSWORD
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
    auth.token = body.access_token;
    auth.expiresAt = Date.now() + body.expires_in * 1000;
    auth.error = "";
    auth.timer = setTimeout(refreshToken, Math.max(30, body.expires_in - 60) * 1000);
    log("[token] Đã lấy token, hết hạn lúc", new Date(auth.expiresAt).toLocaleTimeString("vi-VN"));
  } catch (e) {
    auth.token = "";
    auth.error = String(e.message || e);
    auth.timer = setTimeout(refreshToken, 30000);
    log("[token] Không lấy được token:", auth.error);
  }
}

/* ---------- Gọi server planning (gửi lại khi 5xx) ---------- */
async function planning(path, body) {
  for (let k = 0; ; k++) {
    const res = await fetch(PLANNING_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}`, Origin: APP_ORIGIN },
      body: JSON.stringify(body)
    });
    if (res.ok) return res.json();
    if (res.status === 401) { refreshToken(); throw new Error("401"); }
    if (k >= 2 || res.status < 500) throw new Error(`HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, k ? 1200 : 400));
  }
}

// Dấu hiệu số liệu của một nhóm WO: id bản ghi test mới nhất + số bản ghi (bắt cả bản ghi mới lẫn bản ghi bị xoá)
async function signature(wos) {
  const wo = wos.length === 1
    ? { property: "workOrderCode", operator: "=", value: wos[0] }
    : { property: "workOrderCode", operator: "in", value: wos };
  const [top, count] = await Promise.all([
    planning("/rest/entities/ProductSerialNumberTestHistory/search", { filter: { conditions: [wo] }, sort: "-id", limit: 1 }),
    planning("/rest/entities/ProductSerialNumberTestHistory/search/count", { filter: { conditions: [wo] } })
  ]);
  const last = Array.isArray(top) && top[0] ? top[0].id : 0;
  return `${last}:${Number(count) || 0}`;
}

/* ---------- Nhóm WO đang được xem và các Kanban đang nghe ---------- */
// key (các WO, sắp xếp, cách nhau dấu phẩy) → { wos, clients: Set<res>, sig, checking }
const groups = new Map();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function check(g) {
  if (g.checking || !auth.token) return;
  g.checking = true;
  try {
    const sig = await signature(g.wos);
    if (g.sig && sig !== g.sig) {
      g.clients.forEach(res => send(res, "update", { wos: g.wos, at: Date.now() }));
      log(`[update] ${g.key.slice(0, 60)} → ${g.clients.size} Kanban`);
    }
    g.sig = sig;
    g.error = "";
  } catch (e) {
    g.error = String(e.message || e);
  } finally {
    g.checking = false;
  }
}

// Kiểm tra lần lượt các nhóm (không dồn yêu cầu lên server)
let polling = false;
setInterval(async () => {
  if (polling) return;
  polling = true;
  try {
    for (const g of Array.from(groups.values())) await check(g);
  } finally {
    polling = false;
  }
}, POLL_MS);

/* ---------- HTTP ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://relay");
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: !!auth.token, tokenError: auth.error, pollMs: POLL_MS,
      groups: Array.from(groups.values()).map(g => ({ wos: g.wos.length, clients: g.clients.size, error: g.error || undefined }))
    }));
    return;
  }

  if (url.pathname === "/events") {
    const wos = Array.from(new Set(String(url.searchParams.get("wos") || "").split(",").map(s => s.trim()).filter(Boolean)))
      .sort().slice(0, MAX_WOS);
    if (!wos.length) { res.writeHead(400); res.end("wos?"); return; }
    const key = wos.join(",");
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("retry: 5000\n\n");
    let g = groups.get(key);
    if (!g) { g = { key, wos, clients: new Set(), sig: "", checking: false, error: "" }; groups.set(key, g); check(g); }
    g.clients.add(res);
    send(res, "ready", { wos: wos.length });
    const hb = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    req.on("close", () => {
      clearInterval(hb);
      g.clients.delete(res);
      if (!g.clients.size) groups.delete(key);   // không còn Kanban nào xem nhóm này thì thôi kiểm tra
    });
    return;
  }

  res.writeHead(404); res.end();
});

refreshToken().then(() => {
  server.listen(PORT, () => log(`Kanban relay chạy ở cổng ${PORT}, kiểm tra mỗi ${POLL_MS} ms → ${PLANNING_URL}`));
});
