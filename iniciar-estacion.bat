@echo off
cd /d "%~dp0"
if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
)
if not exist "apps\admin\dist\index.html" (
  echo Preparando la estacion...
  call npm run build --workspace @espejo/admin
)
echo Abri http://127.0.0.1:4780 en esta computadora.
call npm run admin:start
