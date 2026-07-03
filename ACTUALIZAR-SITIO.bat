@echo off
title Florenza V - Subir actualizacion al sitio permanente
cd /d "%~dp0"
echo ============================================
echo  Florenza V - Publicando cambios en el sitio
echo  https://dloaiza05.github.io/florenza-v/
echo ============================================
echo.
git add -A
git commit -m "Actualizacion %date% %time%"
git push
echo.
echo  Listo. En 1-2 minutos los cambios estaran en linea.
echo  (Recarga la pagina en el Quest para verlos)
echo ============================================
pause
