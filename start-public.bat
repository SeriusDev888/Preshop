@echo off
chcp 65001 >nul
title Preshop
cd /d "%~dp0"

rem เบอร์ผู้ดูแลระบบ (เข้าหน้า /admin ได้) ใส่หลายเบอร์คั่นด้วย , เช่น 0812345678,0898765432
set ADMIN_PHONES=

echo ========================================
echo   Preshop - เปิดเว็บให้คนอื่นเข้าได้
echo ========================================
echo.

rem 1) เปิดเซิร์ฟเวอร์ (หน้าต่างแยก) ถ้ายังไม่ได้เปิด
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo เปิดเซิร์ฟเวอร์ Preshop...
  start "Preshop server" cmd /k node server.js
  timeout /t 3 >nul
) else (
  echo เซิร์ฟเวอร์เปิดอยู่แล้ว
)

rem 2) เปิด Cloudflare Tunnel
echo.
echo กำลังสร้างลิงก์สาธารณะ... มองหาบรรทัดที่ลงท้ายด้วย .trycloudflare.com
echo ส่งลิงก์นั้นให้คนอื่นเปิดได้เลย  (ปิดหน้าต่างนี้ = ลิงก์ใช้ไม่ได้)
echo.
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:3000
pause
