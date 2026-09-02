@echo off
:: Busca el servidor en la red (PowerShell) y abre el navegador directo a su IP.
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0Conectar-MathAttack.ps1"
