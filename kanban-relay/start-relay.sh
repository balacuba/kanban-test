#!/bin/sh
# Chạy Kanban relay trên Linux. Cấu hình trong relay.env, tài khoản trong .env.token (cùng thư mục).
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Chưa cài Node.js 18 trở lên"; exit 1; }
[ -f relay.env ] || { echo "Chưa có relay.env: cp relay.env.example relay.env rồi sửa"; exit 1; }
[ -f .env.token ] || { echo "Chưa có .env.token: cp .env.token.example .env.token rồi điền tài khoản"; exit 1; }
while true; do
  node server.mjs
  echo "Relay dừng lại, tự chạy lại sau 5 giây..."
  sleep 5
done
