@echo off
rem One click to play: opens the L2Solo launcher and starts the server (geodata is checked on start).
rem Stop with the launcher's Stop button, Ctrl+C, or by closing this window: the world is saved first.
title L2Solo
cd /d "%~dp0.."
node solo\play.js
if errorlevel 1 pause
