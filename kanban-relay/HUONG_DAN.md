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

## Cài đặt

1. Chọn một máy chạy liên tục trong mạng xưởng, cài **Node.js 18** trở lên. Không cần cài thêm thư viện.
2. Chép thư mục `kanban-relay` sang máy đó.
3. Tạo file `.env.token` cạnh `server.mjs` (chép từ `.env.token.example`) và điền một tài khoản chỉ có quyền đọc
   số liệu sản xuất. Người quản trị tự điền; không gửi file này cho ai và không đưa lên GitHub.
4. Chạy:

   ```bash
   PLANNING_URL=http://14.241.68.10:3000 node server.mjs
   ```

   Trên Windows (PowerShell):

   ```powershell
   $env:PLANNING_URL="http://14.241.68.10:3000"; node server.mjs
   ```

5. Kiểm tra: mở `http://<máy relay>:8765/health`. Thấy `"ok": true` là relay đã lấy được token.

Biến môi trường khác: `PORT` (mặc định 8765), `POLL_MS` (chu kỳ kiểm tra, mặc định 3000), `ALLOW_ORIGIN` (trang
được phép nghe SSE, mặc định mọi trang; nên đặt địa chỉ ứng dụng Jmix), `APP_ORIGIN` (Origin gửi kèm khi gọi
server planning, mặc định `PLANNING_URL`), `TOKEN_FILE` (đường dẫn file tài khoản).

Để relay tự chạy khi máy khởi động, có thể dùng Task Scheduler (Windows), `pm2` hoặc `systemd` (Linux).

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
