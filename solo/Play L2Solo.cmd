@echo off
rem One click to play: opens the L2Solo launcher and starts the server (geodata is checked on start).
rem Stop with the launcher's Stop button or Ctrl+C. Don't just close this window while the server runs.
title L2Solo - stop with Ctrl+C, don't close this window
cd /d "%~dp0.."
node solo\play.js
if errorlevel 1 pause
