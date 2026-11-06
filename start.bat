@echo off
echo ================================
echo   数字人口播工作室 - 启动脚本
echo ================================
echo.

echo [1/2] 启动后端服务...
start "Backend API" cmd /k "cd /d %~dp0server && pip install flask flask-cors requests soundfile -q && python app.py"
timeout /t 3 /nobreak >nul

echo [2/2] 启动前端服务...
start "Frontend Dev" cmd /k "cd /d %~dp0 && npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo ✅ 服务已启动！
echo    前端: http://localhost:3000
echo    后端: http://localhost:5000
echo.
echo 按任意键关闭此窗口...
pause >nul
