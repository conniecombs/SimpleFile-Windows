Unicode True
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!ifndef PAYLOAD
  !error "PAYLOAD must be defined (staged WinUI payload directory)."
!endif
!ifndef VERSION
  !error "VERSION must be defined."
!endif
!ifndef OUTFILE
  !error "OUTFILE must be defined."
!endif
!ifndef ICON
  !define ICON "..\..\src-tauri\icons\icon.ico"
!endif

Name "SimpleFile (WinUI)"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\SimpleFile-WinUI"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "${ICON}"
UninstallIcon "${ICON}"
BrandingText "SimpleFile ${VERSION}"

!define MUI_ABORTWARNING
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "SimpleFile"
VIAddVersionKey /LANG=1033 "FileDescription" "SimpleFile WinUI host"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName" "SimpleFile Team"
VIAddVersionKey /LANG=1033 "LegalCopyright" "SimpleFile Team"

Function .onInit
  nsExec::ExecToLog 'taskkill /F /IM SimpleFile.exe'
  nsExec::ExecToLog 'taskkill /F /IM SimpleFile.App.exe'
  nsExec::ExecToLog 'taskkill /F /IM simplefile-service.exe'
  nsExec::ExecToLog 'taskkill /F /IM simplefile.exe'
  Pop $0
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*.*"

  CreateDirectory "$SMPROGRAMS"
  CreateShortCut "$SMPROGRAMS\SimpleFile (WinUI).lnk" "$INSTDIR\SimpleFile.exe" "" "$INSTDIR\SimpleFile.exe" 0
  CreateShortCut "$DESKTOP\SimpleFile (WinUI).lnk" "$INSTDIR\SimpleFile.exe" "" "$INSTDIR\SimpleFile.exe" 0

  WriteUninstaller "$INSTDIR\uninstall.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "DisplayName" "SimpleFile (WinUI)"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "Publisher" "SimpleFile Team"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "DisplayIcon" "$INSTDIR\SimpleFile.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /F /IM SimpleFile.exe'
  nsExec::ExecToLog 'taskkill /F /IM simplefile-service.exe'
  Pop $0

  Delete "$SMPROGRAMS\SimpleFile (WinUI).lnk"
  Delete "$DESKTOP\SimpleFile (WinUI).lnk"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleFile-WinUI"
SectionEnd
