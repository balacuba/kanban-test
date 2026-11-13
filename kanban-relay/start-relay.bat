@echo off
rem Chạy Kanban relay trên Windows. Cấu hình trong relay.env, tài khoản trong .env.token (cùng thư mục).
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Chua cai Node.js 18 tro len: https://nodejs.org & pause & exit /b 1)
if not exist relay.env (echo Chua co relay.env - chep relay.env.example thanh relay.env roi sua & pause & exit /b 1)
if not exist .env.token (echo Chua co .env.token - chep .env.token.example thanh .env.token roi dien tai khoan & pause & exit /b 1)
:loop
node server.mjs
echo Relay dung lai, tu chay lai sau 5 giay...
timeout /t 5 /nobreak >nul
goto loop
