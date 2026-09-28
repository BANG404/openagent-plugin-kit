@echo off
setlocal
rem Drain the event payload so the runtime's stdin write cannot block.
more >nul
echo {"message":"The reference package observed a tool completion.","tag":"notice"}
