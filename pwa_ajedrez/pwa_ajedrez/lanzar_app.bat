@echo off
title Ajedrez 1-64
cd /d "%~dp0"

rem Arranca el servidor en segundo plano (sin ventana de consola).
set "PYW=%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe"
if not exist "%PYW%" set "PYW=pythonw"
start /b "" "%PYW%" "%~dp0servidor.py"

rem Espera un instante a que el servidor levante.
timeout /t 1 /nobreak >nul

rem Abre el juego como una aplicacion (ventana propia, sin pestanas del navegador).
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://localhost:8000
) else (
  start "" http://localhost:8000
)