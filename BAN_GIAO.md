# Bàn giao dự án Kanban MKV (HourlyOutputReport + Android TV + Kanban relay)

Cập nhật: 25/11/2026 · Bản Kanban đang chạy: **5.3 · 2026-11-25** · App TV: **5.1** (VERSION_CODE 42) · Relay: **1.2**

Tài liệu này để người / team tiếp nhận chạy tiếp dự án mà không cần hỏi lại. Đọc theo thứ tự: mục 0 (bắt đầu nhanh)
→ mục 2 (file nào làm gì) → mục 4 (quy tắc tính số, phần dễ sai nhất) → mục 5 (việc còn dở).

> Repo này **công khai**. Không commit mật khẩu, token, client secret, `*.jks`, `keystore.properties`,
> `account.properties`, `.env.token`, `relay.env`, `kanban-relay/exe/defaults.env` (đã chặn trong `.gitignore`).

---

## 0. Bắt đầu nhanh cho người mới

Cần: Node.js 18+ (đang dùng 20/22), Git. Build APK thêm JDK 17 + Android SDK (platform 34, build-tools 34.0.0).

```powershell
git clone https://github.com/balacuba/kanban-test.git
cd kanban-test
npm install
```

| Việc | Lệnh (chạy ở thư mục gốc repo) | Cổng |
|---|---|---|
| Trang thử với dữ liệu giả (stub) | `node node_modules/vite/bin/vite.js --config harness/vite.config.js` | 5174 |
| Trang thử với **API thật** (tự lấy token) | xem mục 0.1 | 5174 |
| Kiểm tra kiểu TypeScript | `node node_modules/typescript/bin/tsc -p harness/tsconfig.json` và `-p tv/tsconfig.json` | — |
| Sinh lại CSS màn Kanban | `node harness/tools/scope-css.cjs src/dashboard/WoLineDashboard.css harness/src/app/report/HourlyOutputReport.css` | — |
| Build giao diện cho TV | `node node_modules/vite/bin/vite.js build --config tv/vite.config.js` | — |
| Bản React gốc (dữ liệu mẫu, không Jmix) | `npm run dev` | 5173 |

### 0.1 Chạy trang thử với API thật

1. Chép `harness/.env.token.example` thành `harness/.env.token`, tự điền tài khoản (chỉ quyền đọc báo cáo).
   File này đã nằm trong `.gitignore`. Không gửi, không commit.
2. Chạy (PowerShell):
   ```powershell
   $env:PLANNING_URL="http://14.241.68.10:3000"; $env:MDM_URL="http://14.241.68.10:10068"; node --max-http-header-size=131072 node_modules/vite/bin/vite.js --config harness/vite.config.js
   ```
3. Mở http://localhost:5174. Server thử tự lấy token Keycloak, tự gia hạn, và proxy `/planning`, `/mdm` (gắn token,
   sửa Origin cho MDM). Trình duyệt không thấy mật khẩu / token. `?tabs=2` giả lập 2 tab Jmix để thử nhiều Kanban.
4. Xem bản thử đã build: thay lệnh ở bước 2 bằng `... vite.js preview --config harness/vite.config.js` (cổng 4174).

### 0.2 Tra cứu nhanh dữ liệu MES (`tools/mes-query/`)

Các script gọi qua proxy của trang thử ở mục 0.1 (phải đang chạy cổng 5174), không chứa tài khoản:

| Script | Dùng để |
|---|---|
| `node tools/mes-query/sninfo.mjs <SN> [SN...]` | Toàn bộ lịch sử test của SN (công đoạn trước → sau, kết quả, người làm, repairTime) |
| `node tools/mes-query/eh.mjs <SN>` | Các lần ghi lỗi của SN trong `SerialnumberErrorHistory` (mã lỗi, tên lỗi, vị trí/note) |
| `node tools/mes-query/stagedup.mjs <WO> <công đoạn>` | SN qua một công đoạn từ 2 lần trở lên (vd. `11122611111-1 SMT-PCB-AOI-TOP`) |
| `node tools/mes-query/oqc.mjs [yyyy-MM-dd]` | Bản ghi R_OQC trong ngày, đếm theo WO / có mã lỗi hay không (kiểm tra OQC trả lô AQL) |

---

## 1. Project instructions hiện tại

Dự án **không có** file hướng dẫn riêng cho trợ lý AI (không có `CLAUDE.md` hay project instructions); công việc được
làm qua hội thoại với Claude Code trên máy của người phụ trách. Các quy ước đã thống nhất trong suốt quá trình làm,
nên giữ nguyên khi làm tiếp:

1. **Bảo mật**
   - Không đưa tài khoản, mật khẩu, client_secret, token vào code giao diện (`HourlyOutputReport.tsx` dùng token của
     người đang đăng nhập Jmix: `mainStore.authToken`).
   - Tài khoản chỉ nằm trong file do người quản trị tự điền: `harness/.env.token`, `kanban-relay/.env.token`,
     `kanban-relay/exe/defaults.env`, `khoa-ky/account.properties` (APK cài tay). Tất cả đã bị `.gitignore` chặn.
   - APK đưa lên GitHub **không chứa tài khoản**. Không phát APK qua máy chủ LAN tự dựng.
   - Bundle web planning đang chạy trên server có chứa sẵn tài khoản / client secret ghi cứng: **không dùng, không chép**;
     đã báo người phụ trách để báo nhà cung cấp (Facenet) gỡ.
2. **Số trên Kanban phải khớp API**: bảng công đoạn hiện đúng số `stageN_pass / stageN_fail` của `get-daily-report`,
   không tự "sửa" số. Mọi thay đổi cách đếm phải đối chiếu lại với dữ liệu thật (xem mục 4).
3. **Cài lên TV không tự mở app** (TV đang chiếu app khác — SMT Kanban). Cài bằng `adb install -r`, không `am start`.
4. **Mỗi lần sửa giao diện**: tăng mã `data-kanban-version` trong `HourlyOutputReport.tsx` (để kiểm tra bản trên
   server: F12 → Console → `document.querySelector(".wo-dash").dataset.kanbanVersion`), cập nhật `HUONG_DAN.md`.
5. **Sửa phần Android**: tăng `VERSION_CODE` (và `VERSION_NAME`) trong `android-tv/version.properties`.
6. **Xuất code cho server Jmix**: chép thư mục `harness/src/app/report/` (giữ cấu trúc, xem `HUONG_DAN.md` mục "Chép
   vào dự án"); cài thêm `npm install exceljs` trên dự án Jmix.
7. Commit message không dấu, ngắn gọn, mô tả thay đổi; giao tiếp / tài liệu bằng tiếng Việt.

---

## 2. Danh sách file và nội dung

### 2.1 Màn Kanban tích hợp Jmix — `harness/src/app/report/` (đây là phần đưa lên server)

| File | Nội dung |
|---|---|
| `HourlyOutputReport.tsx` | Màn chính (~1900 dòng). Gọi API, cache, gộp nhiều WO, tính số ca / khung giờ / công đoạn, bộ lọc (Model → Tên sản phẩm → Dây chuyền → WO-Line, ngày, ca, khung giờ, công đoạn), KPI, bảng công đoạn (bấm ô Fail xem SN), PM Plan, tự tải lại 5 s / nối relay SSE, đăng ký màn `/HourlyOutputReport`. |
| `HourlyOutputReport.css` | CSS **sinh tự động** từ `src/dashboard/WoLineDashboard.css` bằng `harness/tools/scope-css.cjs` (bọc trong `.wo-dash`). Không sửa tay file này. |
| `HUONG_DAN.md` | Hướng dẫn chép vào dự án, bảng API, toàn bộ quy tắc tính, lưu ý backend. **Tài liệu nghiệp vụ chính.** |
| `mkvision-logo.png` | Logo thanh tiêu đề. |
| `chart/hourlyOutput/KanbanShared.tsx` | Dùng chung: ca làm việc (`SHIFTS`, ngày 08–20, đêm 20–08), khung giờ, `REFRESH_MS=5000`, `MAX_DAYS=31`, đa ngôn ngữ vi/en/zh (`DICT`), `useFitToScreen` (Xem toàn bộ), biểu đồ theo giờ, `ChartPopup`/`ZoomButton`, `KANBAN_RELAY_URL`, chụp SVG → PNG cho Excel. |
| `chart/hourlyOutput/ErrorParetoChart.tsx` | Biểu đồ Pareto (cột + đường % tích lũy, 2 trục thẳng hàng), `DefectSnPanel` (bảng SN: STT, Serial, Công Đoạn, Thời Gian, Mã Lỗi, Tên Lỗi, Vị Trí, Trạng Thái). |
| `chart/hourlyOutput/HourlyOutputPieChart.tsx` | Khối Defect Distribution: lấy tên lỗi từ MDM, bọc Pareto, popup phóng to. |
| `chart/hourlyOutput/HourlyYieldChart.tsx` | Biểu đồ Tỷ lệ đạt / Input, mục tiêu `YIELD_TARGET = 0.95`, chế độ ngày / tháng / năm / giờ. |
| `chart/hourlyOutput/yieldPeriods.ts` | Đếm Input / lỗi 30 ngày, 12 tháng, 3 năm bằng `/search/count`, cache `localStorage "kanban-yield-cache"`. |
| `chart/hourlyOutput/KanbanExcel.ts` | Xuất Excel (exceljs): Tổng quan, Kết quả công đoạn, Pareto, SN lỗi, Theo giờ, Theo ngày/tháng/năm, Biểu đồ (ảnh). |
| `chart/hourlyOutput/HourlyPassOutputChart.tsx`, `HourlyCompleteOutputChart.tsx`, `HourlyFailOutputChart.tsx` | Thẻ Input Detail / Output Detail / Defect Detail. |

### 2.2 Trang thử (chỉ để phát triển, không đưa lên server) — `harness/`

| File | Nội dung |
|---|---|
| `vite.config.js` | Alias Jmix/axios sang stub; chế độ API thật khi có `PLANNING_URL`; proxy `/planning`, `/mdm`; plugin tự lấy token từ `.env.token` (`/__token-status`). Cổng dev 5174, preview 4174. |
| `src/main.tsx` | Khung giả lập ứng dụng Jmix (header, ô dán token tay, `?tabs=N`). |
| `src/config.ts` | `PLANNING_API_URL = "/planning"`, `MDM_URL = "/mdm"` khi thử. |
| `stubs/axios.ts`, `stubs/others.ts` | Thay `@haulmont/jmix-react-*`, `react-toastify`, axios giả. |
| `tools/scope-css.cjs` | Sinh `HourlyOutputReport.css` (postcss, bọc `.wo-dash`, thêm các rule chống CSS của server ghi đè). |
| `.env.token.example` | Mẫu file tài khoản cho trang thử. |

### 2.3 Bản React gốc — `src/dashboard/` (thiết kế ban đầu, dữ liệu mẫu)

`WoLineDashboard.jsx/.css` (CSS gốc của mọi giao diện — sửa style ở đây rồi chạy scope-css), `api.js`, `selectors.js`,
`hooks.js`, `constants.js`, `format.js`, `exportExcel.js`, `chartImages.js`, `mockData.js`, `components/*`. Xem `README.md`.

### 2.4 Bản web cho TV — `tv/`

| File | Nội dung |
|---|---|
| `vite.config.js` | Build ra `android-tv/app/src/main/assets/web`. |
| `src/main.tsx` | Mở Kanban, bật Xem toàn bộ, khoá viewport 1600 px, điều khiển D-pad. |
| `src/bridge-axios.ts` | Thay axios: request đi qua app Android (`AndroidApi.prepare` + `fetch("api/<id>")`). |
| `src/config.ts` | `PLANNING_API_URL = "@planning"`, `MDM_URL = "@mdm"` (app Android thay bằng địa chỉ thật). |
| `src/jmix-stubs.ts`, `src/tv.css` | Thay Jmix / toast; CSS riêng TV. |

### 2.5 App Android TV "Kanban MKV" — `android-tv/` (package `com.mkvision.kanbantv`, Java)

| File | Nội dung |
|---|---|
| `HUONG_DAN_TV.md` | Cài lên TV, tài khoản, tự cập nhật qua GitHub, build. |
| `MainActivity.java` | WebView + WebViewAssetLoader, gọi API kèm token (tự thử lại khi 401), phím Back/Menu, giữ màn hình sáng, cho phép gọi relay http. |
| `LoginActivity.java` | Màn đăng nhập + cài đặt máy chủ (khi không có tài khoản cố định). |
| `Auth.java` | Lấy / gia hạn token Keycloak (`grant_type=password`, client `planning_react`, không secret). |
| `Prefs.java` | Lưu cài đặt; mật khẩu nhập trên TV mã hoá AES-GCM bằng Android Keystore. |
| `Updater.java`, `UpdateReceiver.java` | Tự cập nhật giao diện (web.zip) và APK (PackageInstaller), tự mở lại sau cập nhật. |
| `Http.java` | HTTP helper. |
| `app/build.gradle` | Đọc `version.properties`, `KANBAN_ACCOUNT_FILE` (tài khoản cố định), `KANBAN_UPDATE_URL`; task `makeUpdate`. |
| `version.properties` | `VERSION_CODE=42`, `VERSION_NAME=5.1`, `WEB_VERSION=42001`. |

`.github/workflows/kanban-tv.yml`: mỗi lần push `main` → build web TV + APK → GitHub Release `tv-latest`
(`KanbanTV.apk`, `web.zip`, `update.json`). Cần secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD` (xem mục 5).

### 2.6 Kanban relay (SSE) — `kanban-relay/`

| File | Nội dung |
|---|---|
| `HUONG_DAN.md` | Cài đặt, chuyển server, bật relay cho Kanban, cài bằng exe. |
| `server.mjs` | Relay Node 18+ không thư viện. Mỗi 3 s hỏi server planning "chữ ký" (id mới nhất + số bản ghi) cho từng nhóm WO đang xem, đổi thì đẩy sự kiện `update` qua SSE. `/health` trả `version`, `ok`, `clients`. |
| `exe/setup.cjs`, `exe/build.cjs` | Đóng gói `KanbanRelay.exe` (Node SEA + postject): cài vào `C:\KanbanRelay`, Task Scheduler, tường lửa, cửa sổ nhập tài khoản. Build: `node kanban-relay/exe/build.cjs`. |
| `exe/defaults.env.example` | Mẫu giá trị điền sẵn khi build exe (client secret do người quản trị tự điền vào `defaults.env`). |
| `relay.env.example`, `.env.token.example` | Mẫu cấu hình / tài khoản. |
| `start-relay.bat/.sh`, `install-autostart.bat`, `Dockerfile`, `docker-compose.yml`, `nginx-kanban-relay.conf.example` | Các cách chạy relay. |

### 2.7 Khác

`tools/mes-query/*.mjs` (mục 0.2), `.gitattributes` (`*.bat` CRLF, `*.sh` LF), `.gitignore`, `README.md`, `index.html`,
`vite.config.js`, `package.json` (react 18, exceljs, vite 5, typescript, postject).

---

## 3. Tóm tắt công việc, kết quả và quyết định chính (27/10 → 25/11/2026)

### 3.1 Giai đoạn 1 — Thiết kế Kanban (27–28/10)
- Vẽ lại màn theo dõi lỗi WO-Line thành "Kanban" lấy lỗi làm trọng tâm, React 18 + Vite, CSS thuần, biểu đồ SVG tự vẽ.
- **Quyết định:** 2 ca ngày 08:00–20:00 / đêm 20:00–08:00, tự chuyển ca theo giờ máy (0:00–8:00 thuộc ngày sản xuất hôm
  trước); bảng công đoạn 1 ô "pass / fail" chữ xanh / đỏ, nền trắng, màu tiêu đề teal; co giãn tới 20 công đoạn;
  "Xem toàn bộ" (fit một màn hình) mặc định bật; bộ lọc ẩn sau nút kính lúp; xuất Excel có ảnh biểu đồ; đa ngôn ngữ.

### 3.2 Giai đoạn 2 — Tích hợp code Jmix cũ + API thật (28/10–02/11)
- Ghép vào màn `HourlyOutputReport` cũ, giữ đúng các API cũ (bảng API trong `harness/src/app/report/HUONG_DAN.md`).
- **Phát hiện:** `stageN_pass` của `get-daily-report` = số SN đi tiếp sang công đoạn sau (công đoạn cuối luôn 0);
  `errorList` đếm cả bản ghi test NG lẫn bản ghi sửa (gấp đôi); giờ chỉ chia 6:00–20:00.
- **Quyết định của người phụ trách:** bảng công đoạn hiện **đúng số API**, không tự dịch cột. Pareto chỉ đếm bản ghi
  trạm sửa `R_xxx` để tổng Pareto = cột Fail.
- Pareto vẽ theo mẫu Excel: tỷ lệ = số lỗi / tổng lỗi, tích lũy kết thúc 100%, mỗi cột một màu, bấm cột xem SN.
- Bỏ tỷ lệ lỗi chung lúc đầu; dưới tên công đoạn ghi "n lỗi · Fail/(Pass+Fail)"; thêm dòng Tổng.
- Công đoạn lỗi lấy từ `SerialnumberErrorHistory` (không bị xoá khi bắt repair; có dữ liệu từ 02/11/2026 08:12).

### 3.3 Giai đoạn 3 — App Android TV (02–07/11)
- App "Kanban MKV": WebView + giao diện build sẵn, gọi API từ native (không CORS, token không vào trang web),
  tài khoản cố định khi build cài tay, tự cập nhật qua GitHub Release `tv-latest`.
- Cài trên 2 TV TCL: `172.22.7.110` và `172.22.7.80` (Android 11) qua ADB, **không tự mở app**.

### 3.4 Giai đoạn 4 — Tính năng nghiệp vụ (03–14/11)
- Bảng SN khi bấm ô Fail; cột Tên lỗi, Vị trí (note lúc bắn lỗi), Trạng thái Đang sửa / Đã sửa / OK.
- Tổng lỗi = số SN lỗi khác nhau; tự tải lại 5 giây (cả khi ẩn).
- Bộ lọc Model (= `note` của WO) → Tên sản phẩm → Dây chuyền (`line`/`groupCode`) → WO-Line; chọn nhiều WO,
  "Tất cả WO"; ca "Cả 2 ca"; Excel theo đúng bộ lọc.
- **Quyết định:** Sản lượng hoàn thành = tổng mọi WO trong bộ lọc.
- Tỷ lệ lỗi = tổng lỗi / Input; sau đổi thành **SN lỗi / SN input**.
- Biểu đồ Tỷ lệ đạt / Input, mục tiêu 95%, đạt khi **≥ 95%** (xanh), dưới thì đỏ; theo ngày / tháng / năm
  **tự lấy, không theo bộ lọc**; trục phải 0–100%, cột cao theo trục %.
- Phóng to biểu đồ / bảng công đoạn thành popup.
- Hiệu năng: tối đa 4 request cùng lúc (≥ 6 là server trả 502), tự thử lại 502/503/504, cache ngày cũ, tải tăng dần
  theo `id > maxId` (mỗi lần tải lại từ ~10 MB xuống ~0,8 MB).

### 3.5 Giai đoạn 5 — Nhiều Kanban, relay SSE (13–18/11)
- Sửa lỗi mở nhiều Kanban (id ô lọc riêng, Kanban ẩn không tải).
- **Quyết định:** dùng máy chủ trung gian riêng (Kanban relay) + Server-Sent Events. Đóng gói exe, đã cài ở
  `172.22.7.84:8765` (bản 1.2, chạy bằng `start-relay.bat`, log ra cửa sổ console).
- **Vướng:** trang fcim chạy `http` công khai (14.241.68.10) → Chrome/Edge chặn gọi địa chỉ nội bộ 172.22.x
  (Private Network Access). Đã thử bản 5.2 tự kiểm tra — **người phụ trách quyết định bỏ, giữ như cũ**
  (Kanban tự hỏi server mỗi 5 s khi không nối được relay). Trên TV relay vẫn dùng được.

### 3.6 Giai đoạn 6 — Đối chiếu dữ liệu (18–25/11)
- WO 11122611111-1: 3 SN có 2 bản ghi qua AOI-TOP cùng giây (ghi trùng, không phải test lại; sau đó đã bị xoá);
  2 SN test lại ICT thật sau khi FCT lỗi; 1 SN đi ICT → STOCKIN bỏ qua các công đoạn sau (thực tế 5007).
- **5.2 (20/11):** dòng Tổng đếm số SN khác nhau; lịch sử test thiếu bản ghi (ICT/FCT do máy test ghi riêng) thì cộng
  phần thiếu theo báo cáo.
- **5.3 (25/11):** OQC bốc kiểm AQL — lô trượt thì cả lô sang `R_OQC` **không có mã lỗi**, chỉ SN bốc trúng có lỗi
  trong `SerialnumberErrorHistory`. Kanban lấy mọi bản ghi `R_` (kể cả không mã), gán vào nhóm
  "Trả lô AQL (không mã lỗi)" để danh sách SN khớp cột Fail (vd. 25/11 WO 11122611201-1: 63 = 60 trả lô + 3 có mã).
- Màn "Sửa chữa" của MES không hiện mã / tên lỗi vì đọc bản ghi `R_OQC` (trống `errorCode`) — **không thuộc code này**;
  đội MES cần ghi `errorCode` vào bản ghi R_ hoặc join `SerialnumberErrorHistory`.
- 25/11: đổi tên repo GitHub `kanban-tv` → `kanban-test` (link cũ GitHub tự chuyển hướng).

### 3.7 Lịch sử phiên bản
| Bản | Ngày | Nội dung chính |
|---|---|---|
| TV 3.5 | 02/11 | Công đoạn lỗi từ SerialnumberErrorHistory |
| TV 4.5–4.7 | 05–07/11 | Bảng SN, Vị trí, Trạng thái; bộ lọc model / WO; tỷ lệ đạt; popup phóng to |
| TV 4.8–5.1 | 13–14/11 | Dòng Tổng đếm SN, nhiều Kanban, relay SSE, tải tăng dần |
| Kanban 5.2 | 20/11 | Dòng Tổng đếm SN khác nhau khi lịch sử lệch vài bản ghi |
| Kanban 5.3 | 25/11 | OQC trả lô AQL (bản ghi R_ không mã lỗi) |

Chi tiết: `git log`.

---

## 4. Nội dung quan trọng cần giữ (đầy đủ)

### 4.1 API

| Dữ liệu | API |
|---|---|
| Danh sách WO-Line | `POST {PLANNING}/rest/entities/PlanningWorkOrder/search` — body `{view:"with-profile-programming", sort:"-createTime", filter: workOrderType = LINE, returnCount}` |
| Sản phẩm, sản lượng, công đoạn | `GET {PLANNING}/services/api/production-report/get-common-info/{wo}` |
| Bảng theo giờ, lỗi, hoàn thành | `POST {PLANNING}/services/api/production-report/get-daily-report?workOrderCode={wo}&date={yyyy-MM-dd}` body `{}` |
| Lịch sử test | `POST {PLANNING}/rest/entities/ProductSerialNumberTestHistory/search` (và `/search/count`) |
| Lần ghi lỗi (công đoạn, mã, tên, note/vị trí) | `POST {PLANNING}/rest/entities/SerialnumberErrorHistory/search` (lọc `createdAt`) |
| Tên lỗi | `POST {MDM}/api/errors` (MDM kiểm Origin — gọi từ trình duyệt phải đúng origin ứng dụng) |
| Token | Keycloak `http://14.241.68.10:8800/auth/realms/QLSX/protocol/openid-connect/token` (`planning_react`: password grant không secret) |

Server: planning `http://14.241.68.10:3000` (= fcim.mkvision.com:3000; DNS đôi khi lỗi, dùng IP), MDM `http://14.241.68.10:10068`.
Toán tử lọc Jmix dùng được: `=`, `<>`, `>=`, `<`, `in`, `startsWith`, `notEmpty`; `PlanningWorkOrder` lọc theo `woId` (không có `code`).

### 4.2 Quy tắc đếm (đã đối chiếu với get-daily-report từng WO / từng ngày)

- **Pass của công đoạn X** = bản ghi lịch sử test có `preStageName = X` và `stageName ≠ "R_X"`.
- **Fail của công đoạn X** = bản ghi có `stageName = "R_X"` (trạm sửa).
- **Input** = Pass công đoạn đầu của từng WO. **Output** = `completeQuantity`. OutputGroup PM Plan = công đoạn "VMI".
- **Sửa xong** = bản ghi kế tiếp của SN có `preStageName = R_X` (vd. R_OQC → VMI), `repairTime` = lúc sửa xong.
  **OK** = sau đó SN có bản ghi `preStageName` = công đoạn được trả về, `testResult = 1`.
- **Công đoạn lỗi**: (1) `SerialnumberErrorHistory.stageName` ghép theo SN + mã lỗi + lệch ≤ 10 phút → (2) công đoạn
  được trả về sau sửa → (3) trạm sửa.
- `testTime` = lúc SN đến; `repairTime` = lúc hoàn tất (công đoạn tự động ICT/FCT do "integration" ghi: thời gian test thật).
- Tỷ lệ đạt theo kỳ: lỗi = số bản ghi `stageName startsWith "R_"`; Input = số bản ghi `preStageName` = công đoạn đầu
  và `stageName <> "R_<đầu>"`; ngày sản xuất 08:00 → 08:00.

### 4.3 Code cốt lõi — dòng Tổng đếm SN (`HourlyOutputReport.tsx`)

```ts
// Số SN khác nhau (sns) từ nHist bản ghi lịch sử test, so với rec lần của báo cáo: lịch sử thiếu bản ghi thì cộng phần thiếu
const snCount = (sns: number, nHist: number, rec: number) => (nHist >= rec ? sns : sns + rec - nHist);

// Số liệu cho ca đang xem sau khi lọc khung giờ + công đoạn
function computeView(d: KanbanData, shiftIndex: number, from: number, to: number, sel: number[]) {
  const hrs = shiftSlots(shiftIndex).filter(i => i >= from && i <= to);
  const rows = hrs.map(h => ({ slot: SLOTS[h], cells: sel.map(j => d.rows[h][j]) }));
  const totals = sel.map((j, k) => {
    const recPass = sum(rows.map(r => r.cells[k][0])), recFail = sum(rows.map(r => r.cells[k][1]));
    if (!d.snMarks) return [recPass, recFail];
    const id = stageId(d.stages[j].name), pass = new Set<string>(), fail = new Set<string>();
    let nPass = 0, nFail = 0;
    d.snMarks.forEach(m => {
      if (m.stage !== id || hrs.indexOf(m.slot) < 0) return;
      if (m.fail) { nFail++; fail.add(m.sn); } else { nPass++; pass.add(m.sn); }
    });
    return [snCount(pass.size, nPass, recPass), snCount(fail.size, nFail, recFail)];
  });
  const useBackendFail = sel.length === d.stages.length && d.hasFailTable;
  const failByHour = hrs.map((h, k) => (useBackendFail ? d.failByHour[h] : sum(rows[k].cells.map(c => c[1]))));
  return {
    hrs, rows, totals,
    failByStage: totals.map(c => c[1]),
    failByHour,
    totalFail: sum(failByHour),
    labels: hrs.map(h => HOURS[h]),
    input: hrs.map(h => d.inByHour[h]),   // Input = Pass công đoạn đầu (stage0_pass), cộng từng WO
    output: hrs.map(h => d.outputByHour[h])
  };
}
```

### 4.4 Code cốt lõi — lấy bản ghi lỗi (`fetchDefectRecords`, bản 5.3)

```ts
async function fetchDefectRecords(wo: string | string[], days: string[], auth: any, full = true): Promise<DefectRecord[]> {
  const from = days[0], to = addDays(days[days.length - 1], 1);
  // Lấy mọi bản ghi tại trạm sửa R_xxx, kể cả bản ghi không có mã lỗi (vd. OQC trả cả lô: mọi SN của lô sang R_OQC,
  // chỉ vài SN có lỗi ghi ở SerialnumberErrorHistory) — để số SN lỗi khớp cột Fail
  const [errors, logged] = await Promise.all([
    historyCached(wo, from, to, { property: "stageName", operator: "startsWith", value: "R_" }, auth, full),
    historyCached(wo, addDays(from, -1), addDays(to, 1), null, auth, full, "SerialnumberErrorHistory", "createdAt")
      .catch(() => [] as any[])
  ]);
  const errorLog = new Map<string, { time: number; stage: string; name: string; note: string }[]>();   // "SN|mã lỗi" → các lần ghi lỗi
  const errorLogSn = new Map<string, { time: number; code: string }[]>();   // SN → các lần ghi lỗi (mọi mã)
  logged.forEach(r => {
    const sn = String(r.serialNumber || "").trim(), code = String(r.errorCode || "").trim();
    const key = `${sn}|${code}`;
    const time = Date.parse(String(r.createdAt || ""));
    const list = errorLog.get(key) || [];
    list.push({ time, stage: String(r.stageName || "").trim(), name: String(r.errorName || "").trim(), note: String(r.note || "").trim() });
    errorLog.set(key, list);
    if (code) errorLogSn.set(sn, (errorLogSn.get(sn) || []).concat({ time, code }));
  });
  // Bản ghi trạm sửa không có mã lỗi: lấy mã lỗi đã ghi cho SN đó quanh thời điểm ấy (lệch ≤ 10 phút); không có thì để trống
  const loggedCodes = (sn: string, time: string) => {
    const t = Date.parse(time);
    return Array.from(new Set((errorLogSn.get(sn) || []).filter(e => Math.abs(e.time - t) <= 10 * 60 * 1000).map(e => e.code)));
  };
  // Lần ghi lỗi gần thời điểm bản ghi trạm sửa nhất (cùng lúc hoặc lệch vài phút)
  const loggedError = (sn: string, code: string, time: string) => {
    const t = Date.parse(time);
    let best = { stage: "", name: "", note: "" }, gap = 10 * 60 * 1000;
    (errorLog.get(`${sn}|${code}`) || []).forEach(e => {
      const d = Math.abs(e.time - t);
      if (d <= gap) { gap = d; best = e; }
    });
    return best;
  };
  const snOf = (r: any) => String(r.serialNumber || "").trim();
  const repairErrors = errors.filter(r => /^R_/.test(String(r.stageName || "").trim()));
  const doneKey = (r: any) => `${snOf(r)}|${String(r.stageName || "").trim()}|${String(r.testTime || "")}`;
  const sns = Array.from(new Set(repairErrors.filter(r => full || !repairDone.has(doneKey(r))).map(snOf).filter(Boolean)));
  const history = await fetchSnHistory(sns, from, auth).catch(() => [] as any[]);
  const bySn = new Map<string, any[]>();
  history.forEach(r => {
    const list = bySn.get(snOf(r)) || [];
    list.push(r);
    bySn.set(snOf(r), list);
  });
  const timeOf = (r: any) => String(r.testTime || "");
  const repairOf = (sn: string, station: string, time: string) => {
    const list = bySn.get(sn) || [];
    const back = list.filter(x => String(x.preStageName || "").trim() === station && timeOf(x) >= time)[0];
    if (!back) return { returnStage: "", status: "repairing" as RepairStatus };
    const returnStage = String(back.stageName || "").trim();
    const doneAt = Date.parse(String(back.repairTime || back.testTime || ""));
    const passed = list.some(x => String(x.preStageName || "").trim() === returnStage && Number(x.testResult) === 1
      && Date.parse(timeOf(x)) > doneAt);
    return { returnStage, status: (passed ? "ok" : "repaired") as RepairStatus };
  };
  const out: DefectRecord[] = [];
  repairErrors.forEach(r => {
    const stageName = String(r.stageName || "").trim();
    const time = String(r.testTime || "");
    const hour = Number(time.slice(11, 13));
    const stage = stageName.replace(/^R_/, "");
    const sn = String(r.serialNumber || r.qaNumber || "").trim();
    const dk = doneKey(r);
    const { returnStage, status } = !full && repairDone.has(dk)
      ? { returnStage: repairDone.get(dk) as string, status: "ok" as RepairStatus } : repairOf(snOf(r), stageName, time);
    if (status === "ok") { if (repairDone.size > 20000) repairDone.clear(); repairDone.set(dk, returnStage); }
    let codes = String(r.errorCode || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (!codes.length) codes = loggedCodes(snOf(r), time);
    if (!codes.length) codes = [""];
    codes.forEach(code => {
      const log = loggedError(String(r.serialNumber || "").trim(), code, time);
      out.push({ code, stage, slot: SLOT_HOUR.indexOf(hour), sn, time, returnStage, status, errorStage: log.stage, errorName: log.name,
        position: log.note || String(r.note || "").trim() });
    });
  });
  return out;
}
```

Hiển thị tên lỗi (mã rỗng → nhóm trả lô AQL):

```ts
const errName = (r: DefectRecord) => (r.code ? errorNames.get(r.code) || r.errorName : t("pareto.noCode"));
// KanbanShared.tsx: "pareto.noCode" = "Trả lô AQL (không mã lỗi)" / "AQL lot reject (no error code)" / "AQL 整批退回（无不良代码）"
```

### 4.5 Hằng số cấu hình

| Hằng | File | Giá trị |
|---|---|---|
| `REFRESH_MS` | KanbanShared.tsx | 5000 (tự tải lại) |
| `MAX_DAYS` | KanbanShared.tsx | 31 |
| `KANBAN_RELAY_URL` | KanbanShared.tsx | `http://172.22.7.84:8765` (ghi đè từng máy: `localStorage "kanban-relay"`) |
| `RELAY_SAFETY_MS` | KanbanShared.tsx | 60000 |
| `YIELD_TARGET` | HourlyYieldChart.tsx | 0.95 |
| `POOL` | HourlyOutputReport.tsx | 4 request cùng lúc |
| `SCAN_EVERY` | HourlyOutputReport.tsx | 12 (dò lại WO chưa chạy ~1 phút / lần) |
| Relay `POLL_MS`, `PORT` | relay.env | 3000, 8765 |

### 4.6 Build và cài APK lên TV (không mở app)

```bash
# 1. Build web TV
node node_modules/vite/bin/vite.js build --config tv/vite.config.js
# 2. Build APK (cần android-tv/keystore.properties + kanbantv-release.jks; tài khoản cố định qua KANBAN_ACCOUNT_FILE)
cd android-tv
JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.21.21-hotspot" \
KANBAN_UPDATE_URL="https://github.com/balacuba/kanban-test/releases/download/tv-latest/update.json" \
./gradlew.bat --no-daemon -q assembleRelease
# 3. Cài (Git Bash). Đường dẫn ngắn, không dấu cách; KHÔNG chạy am start / monkey
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
mkdir -p /c/Users/Public/kbtest && cp app/build/outputs/apk/release/*.apk /c/Users/Public/kbtest/KanbanTV.apk
cd /c/Users/Public
"$ADB" connect 172.22.7.110:5555
MSYS_NO_PATHCONV=1 "$ADB" -s 172.22.7.110:5555 install -r 'C:\Users\Public\kbtest\KanbanTV.apk'
"$ADB" -s 172.22.7.110:5555 shell dumpsys package com.mkvision.kanbantv | grep versionName
rm -rf /c/Users/Public/kbtest
```

TV lần đầu kết nối ADB phải bấm "Cho phép gỡ lỗi USB" trên TV.

---

## 5. Việc còn dang dở và bước tiếp theo

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | **Sao lưu khoá ký APK** `kanbantv-release.jks` + `keystore.properties` | Người bàn giao | Hiện chỉ còn trên máy người bàn giao (thư mục dự án làm việc, `Desktop\Kanban_TV\khoa-ky` đã bị xoá). **Mất khoá = phải gỡ và cài lại app trên từng TV.** Giữ ở nơi riêng tư (kho mật khẩu / ổ nội bộ), không đưa lên GitHub. |
| 2 | Đặt GitHub Secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD` cho repo `kanban-test` | Chủ repo | Chưa có nên workflow build APK đang báo lỗi và chưa có Release `tv-latest` → TV chưa tự cập nhật được. Đặt ở Settings → Secrets and variables → Actions. |
| 3 | Triển khai Kanban 5.3 lên server fcim | Team Jmix | Chép `harness/src/app/report/` theo `HUONG_DAN.md`; kiểm tra `data-kanban-version` = "5.3 · 2026-11-25". |
| 4 | Cài app TV bản mới (nếu đổi giao diện) lên `172.22.7.110`, `172.22.7.80` | Team tiếp nhận | TV đang 5.1 (giao diện 5.1). Muốn TV có logic 5.2/5.3: build + cài lại theo 4.6, hoặc làm xong mục 2 để tự cập nhật. |
| 5 | Relay bị trình duyệt chặn trên trang http fcim | Hạ tầng | Hướng xử lý: đưa relay ra cùng origin qua nginx của fcim (`nginx-kanban-relay.conf.example`), hoặc chạy fcim bằng https + cho phép Local network access. Hiện Kanban tự hỏi server 5 s/lần — chạy đúng, chỉ tốn tải. |
| 6 | Relay `172.22.7.84` chạy bằng `start-relay.bat` (không log file) | Hạ tầng | Nên cài lại bằng `KanbanRelay.exe` để tự chạy khi bật máy và có log `C:\KanbanRelay\relay.log`. Client secret điền vào `kanban-relay/exe/defaults.env` trước khi build exe. |
| 7 | Màn "Sửa chữa" của MES không hiện mã / tên lỗi cho bản ghi R_OQC | Đội MES | Ghi `errorCode` vào bản ghi trạm sửa, hoặc join `SerialnumberErrorHistory` theo SN + thời gian. |
| 8 | Backend `get-daily-report` | Đội backend | (a) `stageN_pass` đang là số đi tiếp sang công đoạn sau, nên là Pass tại chính công đoạn; (b) chỉ chia giờ 6:00–20:00, ca đêm gần như trống. |
| 9 | Gỡ tài khoản ghi cứng trong bundle web planning | Facenet | Báo nhà cung cấp; đổi mật khẩu tài khoản đó. |
| 10 | Bản React gốc `src/dashboard/` | — | Chỉ là thiết kế ban đầu (dữ liệu mẫu). Mọi style vẫn sửa ở `WoLineDashboard.css` rồi chạy scope-css. |

Cách kiểm tra Kanban chạy đúng sau khi sửa: mở trang thử API thật, chọn WO + ngày, so dòng Tổng / Fail của bảng công
đoạn với `get-daily-report`, tổng Pareto = tổng Fail khi lọc công đoạn, bấm ô Fail số SN = số Fail; xuất Excel mở được.
