@echo off
echo ==========================================
echo   UPLOADING BACKEND TO GITHUB...
echo ==========================================

"C:\Program Files\Git\cmd\git.exe" remote remove origin
"C:\Program Files\Git\cmd\git.exe" remote add origin https://github.com/Sumiartoni/public-koffiee-backend.git
"C:\Program Files\Git\cmd\git.exe" branch -M main
"C:\Program Files\Git\cmd\git.exe" push -u origin main

echo.
echo ==========================================
echo   SELESAI!
echo   Sekarang cek di: https://github.com/Sumiartoni/public-koffiee-backend
echo ==========================================
pause
