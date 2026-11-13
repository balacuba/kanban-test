# Kanban relay (Server-Sent Events)

Khi mở nhiều Kanban cùng lúc (nhiều tab, nhiều máy, nhiều TV), mỗi Kanban tự hỏi server planning 5 giây một lần. Số
Kanban càng nhiều thì server càng dễ quá tải và trả lỗi 502.

Kanban relay là một máy chủ nhỏ đứng giữa:

```
server planning  ←── hỏi 1 lần / 3 giây cho mỗi nhóm WO ───  Kanban relay
                                                                │ SSE: "update" khi có bản ghi test mới
                                         ┌──────────────────────┼──────────────────────┐
                                     Kanban 1               Kanban 2                 TV …
                         (chỉ tải lại khi relay báo có số liệu mới)
```

- Relay chỉ gửi một yêu cầu nhẹ cho mỗi nhóm WO đang được xem: bản ghi test mới nhất và số bản ghi. Khi số liệu
  đổi, relay đẩy sự kiện `update` cho mọi Kanban đang xem nhóm WO đó.
- Kanban chỉ tải lại khi có số liệu mới. Để chắc chắn không lỡ sự kiện, Kanban vẫn tự tải lại mỗi phút.
- Relay không gửi số liệu sản xuất, tài khoản hay token xuống trình duyệt.
- Relay tắt hoặc mất kết nối: Kanban tự quay về cách cũ (tự hỏi mỗi 5 giây). Khi relay chạy lại, Kanban tự nối lại.
- Kanban đang ẩn (tab màn hình khác của ứng dụng) không tải lại; khi hiện lại sẽ tải ngay.

## Các file trong gói

| File | Dùng để |
|---|---|
| `server.mjs` | Chương trình relay (Node.js 18+, không cần cài thư viện) |
| `relay.env.example` | Mẫu cấu hình: địa chỉ server planning, cổng, CORS… → chép thành `relay.env` |
| `.env.token.example` | Mẫu file tài khoản → chép thành `.env.token`, người quản trị tự điền |
| `start-relay.bat` / `start-relay.sh` | Chạy relay trên Windows / Linux (tự chạy lại nếu dừng) |
| `install-autostart.bat` | Windows: cho relay tự chạy khi máy khởi động (chạy bằng quyền Administrator) |
| `Dockerfile`, `docker-compose.yml` | Chạy bằng Docker |
| `nginx-kanban-relay.conf.example` | Chuyển hướng `/kanban-relay/` của server ứng dụng tới relay (bắt buộc khi ứng dụng chạy https) |

## Cài đặt / chuyển sang server khác

1. Chép cả thư mục `kanban-relay` sang máy chạy relay (máy chạy liên tục, vào được server planning, Kanban/TV vào
   được máy này).
2. Chép `relay.env.example` thành `relay.env`, sửa `PLANNING_URL` (địa chỉ server planning) và nếu cần
   `APP_ORIGIN`, `ALLOW_ORIGIN`, `PORT`.
3. Chép `.env.token.example` thành `.env.token`, điền một tài khoản chỉ có quyền đọc số liệu sản xuất. Không gửi
   file này cho ai và không đưa lên GitHub.
4. Chạy theo một trong các cách:
   - **Windows:** bấm đúp `start-relay.bat`. Muốn tự chạy khi bật máy: chuột phải `install-autostart.bat` →
     Run as administrator.
   - **Linux:** `sh start-relay.sh` (hoặc dùng `pm2` / `systemd` để chạy nền).
   - **Docker:** `docker compose up -d`.
5. Kiểm tra: mở `http://<máy relay>:8765/health`. Thấy `"ok": true` là relay đã lấy được token.
6. Mở cổng 8765 trên tường lửa của máy relay cho các máy Kanban/TV.

Trỏ relay sang server planning khác: chỉ sửa `PLANNING_URL` trong `relay.env` rồi chạy lại relay. Kanban không phải
sửa gì (vẫn nối vào địa chỉ relay).

Chuyển relay sang máy khác: làm lại các bước trên ở máy mới, rồi đổi `KANBAN_RELAY_URL` của Kanban sang địa chỉ máy
mới. Nếu dùng nginx chuyển hướng (`/kanban-relay/`), chỉ cần sửa dòng `proxy_pass` trong nginx, Kanban không phải
build lại.

## Bật relay cho Kanban

Chọn một trong các cách:

- **Cho mọi máy:** trong `chart/hourlyOutput/KanbanShared.tsx`, sửa
  `export const KANBAN_RELAY_URL = "";` thành `export const KANBAN_RELAY_URL = "http://<máy relay>:8765";`
  rồi build lại ứng dụng.
- **Cho một máy (không sửa code):** mở Kanban, bấm F12 → Console, chạy
  `localStorage.setItem("kanban-relay", "http://<máy relay>:8765")` rồi tải lại trang.
  Bỏ: `localStorage.removeItem("kanban-relay")`.

Kiểm tra Kanban đã nối relay: trang `/health` của relay hiện số Kanban (`clients`) đang nghe.

Lưu ý: nếu ứng dụng Jmix chạy bằng `https`, relay cũng phải chạy sau `https` (ví dụ qua nginx), vì trình duyệt chặn
trang `https` gọi tới địa chỉ `http`.

## Cài bằng KanbanRelay.exe (Windows, không cần cài Node.js)

`KanbanRelay.exe` gồm sẵn Node.js và relay trong một file.

1. Chép `KanbanRelay.exe` sang máy sẽ chạy relay (máy chạy liên tục trong mạng xưởng).
2. Bấm đúp `KanbanRelay.exe`. Lần đầu chương trình xin quyền Administrator rồi hỏi:
   - địa chỉ server planning, cổng relay (mặc định 8765);
   - tài khoản để relay đọc số liệu (Keycloak token URL, client ID, client secret, tên đăng nhập, mật khẩu).
     Mật khẩu và client secret không hiện khi gõ; file tài khoản chỉ Administrators và SYSTEM đọc được.
3. Chương trình tự cài vào `C:\KanbanRelay`, cho relay tự chạy khi bật máy (Task Scheduler "Kanban relay"), mở cổng
   tường lửa, chạy relay và in ra địa chỉ để Kanban / TV trỏ về, ví dụ `http://172.22.88.27:8765`.
4. Gửi địa chỉ đó để cấu hình `KANBAN_RELAY_URL` cho Kanban / TV.

Sau khi cài:
- Bấm đúp `C:\KanbanRelay\KanbanRelay.exe`: xem trạng thái (đang chạy, token, số Kanban đang nghe, địa chỉ IP).
- `KanbanRelay.exe --setup`: sửa cấu hình / tài khoản (vd. chuyển sang server planning khác).
- `KanbanRelay.exe --run`: chạy relay trong cửa sổ để xem log trực tiếp (tắt bản chạy nền trước nếu cùng cổng).
- `KanbanRelay.exe --uninstall`: gỡ tự chạy và luật tường lửa.
- Log chạy nền: `C:\KanbanRelay\relay.log`.

Windows có thể cảnh báo "Windows protected your PC" vì exe chưa ký số: bấm **More info → Run anyway**.

Build lại exe (sau khi sửa `server.mjs`): `node kanban-relay/exe/build.cjs` (cần `npm i -D postject`).
