@echo off
setlocal
rem Drain the event payload so the runtime's stdin write cannot block.
more >nul
echo {"message":"A tool finished in this conversation.","tag":"notice"}
