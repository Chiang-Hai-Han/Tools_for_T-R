@echo off
chcp 65001 >nul
title 截图OCR本地服务

cd /d "%~dp0"

echo ========================================
echo   截圖 OCR 本地服務
echo ========================================
echo.
echo 正在啟動 EasyOCR 服務...
echo 首次啟動需加載模型，請稍候...
echo.
echo 服務地址: http://localhost:8765
echo 關閉此窗口即可停止服務
echo ========================================
echo.

C:\Users\jianghaihan\.workbuddy\binaries\python\envs\default\Scripts\python.exe ocr_server.py

pause
