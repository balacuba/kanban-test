@echo off
rem Cho Kanban relay tự chạy khi Windows khởi động (Task Scheduler). Chạy file này bằng quyền Administrator.
rem Gỡ: schtasks /delete /tn "Kanban relay" /f
chcp 65001 >nul
cd /d "%~dp0"
schtasks /create /tn "Kanban relay" /tr "\"%~dp0start-relay.bat\"" /sc onstart /ru SYSTEM /rl HIGHEST /f
if errorlevel 1 (echo Khong tao duoc - hay chay bang quyen Administrator & pause & exit /b 1)
schtasks /run /tn "Kanban relay"
echo Da cai: relay tu chay khi khoi dong may. Kiem tra: http://localhost:8765/health
pause
