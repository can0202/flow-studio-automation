; Custom NSIS installer script for Flow Studio
; This script runs after the main installation to set up required components

!macro customInstall
  ; Create a batch file to install Playwright browsers
  DetailPrint "Cài đặt trình duyệt tự động hoá..."
  
  ; Write install-browsers batch script
  FileOpen $0 "$INSTDIR\install-browsers.bat" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "echo Cai dat trinh duyet tu dong hoa Flow Studio...$\r$\n"
  FileWrite $0 "cd /d $\"%INSTDIR%$\"$\r$\n"
  FileWrite $0 "set PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\ms-playwright$\r$\n"
  FileWrite $0 '$\"%INSTDIR%\resources\app.asar.unpacked\node_modules\playwright\cli.js$\" install chromium$\r$\n'
  FileWrite $0 "echo Hoan thanh cai dat!$\r$\n"
  FileWrite $0 "pause$\r$\n"
  FileClose $0
  
  ; Run installation of Playwright Chromium silently
  ExecWait '"$WINDIR\system32\cmd.exe" /c "set PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\ms-playwright && node "$INSTDIR\resources\app.asar.unpacked\node_modules\playwright\cli.js" install chromium"' $1
  
  ${If} $1 == 0
    DetailPrint "Trinh duyet tu dong hoa da duoc cai dat thanh cong!"
  ${Else}
    DetailPrint "Khong the cai dat trinh duyet. Vui long chay install-browsers.bat trong thu muc cai dat."
  ${EndIf}
!macroend

!macro customUnInstall
  ; Clean up on uninstall
  Delete "$INSTDIR\install-browsers.bat"
!macroend
