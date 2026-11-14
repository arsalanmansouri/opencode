; OpenCode installer for Windows.
;
; Installs for the current user only, so it needs no administrator rights:
; copies opencode.exe to %LOCALAPPDATA%\Programs\OpenCode, puts that folder on
; the user's PATH, adds Start Menu and Desktop shortcuts, and registers an
; uninstaller under Apps & Features. User data (sessions, credentials, config)
; lives elsewhere and is left alone by both install and uninstall.
;
; Built by script/windows/installer.ts, which passes these defines:
;   VERSION   1.2.3          BINARY   path to opencode.exe
;   ICON      path to .ico   LICENSE  path to the license text
;   OUTFILE   installer path PATHSCRIPT path to path.ps1

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
ManifestDPIAware true

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

; PATH edits go through path.ps1 (see that file for why), then tell open windows to reload it.
!macro EditPath ACTION
  InitPluginsDir
  File "/oname=$PLUGINSDIR\path.ps1" "${PATHSCRIPT}"
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\path.ps1" -Action ${ACTION} -Dir "$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Could not update PATH (exit code $0). Add $INSTDIR to PATH yourself to run opencode from a terminal."
  ${EndIf}
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!define APP "OpenCode"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"

Name "${APP}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "${UNINSTALL_KEY}" "InstallLocation"
BrandingText "${APP} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APP} installer"
VIAddVersionKey "LegalCopyright" "MIT License"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "This installs ${APP} ${VERSION}, an AI coding agent that runs in your terminal.$\r$\n$\r$\nNo administrator rights are needed. ${APP} is installed for your user account only and added to your PATH, so you can also start it by typing opencode in any new terminal."
!define MUI_FINISHPAGE_TEXT "${APP} is installed.$\r$\n$\r$\nStart it from the Start Menu or Desktop shortcut, or type opencode in a new terminal inside any project folder. Run /connect inside ${APP} to sign in to a model provider."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Run ${APP} now"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "${APP}" SecApp
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "/oname=opencode.exe" "${BINARY}"
  File "/oname=opencode.ico" "${ICON}"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Shortcuts start in the user's home folder, which OpenCode treats as the project.
  SetOutPath "$PROFILE"
  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\opencode.exe" "" "$INSTDIR\opencode.ico" 0
  SetOutPath "$INSTDIR"

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${APP}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\opencode.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  SectionGetSize ${SecApp} $0
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" $0
SectionEnd

Section "Add to PATH" SecPath
  !insertmacro EditPath "Add"
SectionEnd

Section "Desktop shortcut" SecDesktop
  SetOutPath "$PROFILE"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\opencode.exe" "" "$INSTDIR\opencode.ico" 0
  SetOutPath "$INSTDIR"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecApp} "The opencode program and a Start Menu shortcut."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecPath} "Lets you start OpenCode by typing opencode in any new terminal."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "A shortcut on your Desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function LaunchApp
  ; A console program started from the installer gets its own terminal window.
  SetOutPath "$PROFILE"
  Exec '"$INSTDIR\opencode.exe"'
FunctionEnd

Section "Uninstall"
  !insertmacro EditPath "Remove"
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$DESKTOP\${APP}.lnk"
  Delete "$INSTDIR\opencode.exe"
  Delete "$INSTDIR\opencode.ico"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
