@echo off
title Florenza V - Servidor para Meta Quest
cd /d "%~dp0"
echo ============================================
echo  Florenza V - Iniciando servidor para el Quest
echo ============================================
echo.
echo [1/3] Iniciando servidor local en el puerto 8123...
start "FlorenzaV-Servidor" /min cmd /c "npx -y serve . -l 8123"
timeout /t 5 >nul
echo [2/3] Creando tunel HTTPS gratuito...
del herramientas\tunel.log >nul 2>&1
del herramientas\url.txt >nul 2>&1
start "FlorenzaV-Tunel" /min cmd /c "herramientas\cloudflared.exe tunnel --url http://localhost:8123 2> herramientas\tunel.log"
echo [3/3] Esperando la URL del tunel...
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){Start-Sleep 1; $m=Select-String -Path 'herramientas\tunel.log' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1; if($m){$u=$m.Matches[0].Value; Set-Content -Path 'herramientas\url.txt' -Value $u -Encoding ascii; Write-Host ''; Write-Host ('   URL PARA EL QUEST:  ' + $u); Write-Host ''; Write-Host '   Abriendo el codigo QR en pantalla...'; Start-Process 'http://localhost:8123/qr.html'; exit }}; Write-Host 'No se obtuvo la URL. Revisa herramientas\tunel.log'"
echo.
echo  Mira el QR de la pantalla con el Quest puesto y toca la notificacion.
echo  Deja esta ventana abierta mientras uses las gafas.
echo ============================================
pause

