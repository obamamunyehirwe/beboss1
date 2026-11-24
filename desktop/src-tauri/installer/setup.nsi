!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"

Name "BeBoss Desktop ${VERSION}"
OutFile "..\..\target\release\BeBoss-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\BeBoss"
InstallDirRegKey HKLM "Software\BeBoss" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetCompressorDictSize 32

; Interface Settings
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING
!define MUI_ICON "icons\icon.ico"
!define MUI_UNICON "icons\icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "header.bmp"
!define MUI_BGCOLOR FFFFFF

; Welcome Page
!define MUI_WELCOMEPAGE_TITLE "Welcome to BeBoss Desktop Setup"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of BeBoss Desktop $\r$\n$\r$\n\
BeBoss is an offline-first retail operating system for modern businesses.$\r$\n$\r$\n\
Features:$\r$\n\
• Point of Sale with barcode support$\r$\n\
• Multi-branch inventory management$\r$\n\
• Customer credit and debt tracking$\r$\n\
• Real-time sync with Android terminals$\r$\n\
• Offline-first with encrypted local database$\r$\n\
• Reports and analytics$\r$\n$\r$\n\
Version: ${VERSION}$\r$\n$\r$\n\
Click 'Next' to continue."
!insertmacro MUI_PAGE_WELCOME

; License Page
!define MUI_LICENSEPAGE_CHECKBOX
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"

; Directory Page
!insertmacro MUI_PAGE_DIRECTORY

; Custom System Requirements Page
Page Custom RequirementsPage RequirementsPageLeave

; Install Page
!insertmacro MUI_PAGE_INSTFILES

; Finish Page
!define MUI_FINISHPAGE_TITLE "BeBoss Desktop Installation Complete"
!define MUI_FINISHPAGE_TEXT "BeBoss Desktop has been installed successfully.$\r$\n$\r$\n\
Click 'Finish' to close this wizard. You can now launch BeBoss from your desktop or Start Menu.$\r$\n$\r$\n\
First-time users should connect their BeBoss Android terminal to sync shop data."
!define MUI_FINISHPAGE_RUN "$INSTDIR\BeBoss.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch BeBoss Desktop now"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.md"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "View README"
!define MUI_FINISHPAGE_LINK "Visit BeBoss Online"
!define MUI_FINISHPAGE_LINK_LOCATION "https://beboss.rw"
!insertmacro MUI_PAGE_FINISH

; Uninstall Pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Language Files
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "French"

; Reserve Files
ReserveFile "welcome.bmp"
ReserveFile "header.bmp"

Var RequirementsOK
Var RequirementsText

Section "BeBoss Desktop" SecMain
  SectionIn RO
  
  ; Pre-install checks
  Call CheckWebView2
  Call CheckVCppRuntime
  
  ; Set output path
  SetOutPath "$INSTDIR"
  
  ; Install main executable
  File "..\..\target\release\BeBoss.exe"
  
  ; Install resources
  SetOutPath "$INSTDIR"
  File "LICENSE.txt"
  
  ; Create data directory
  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\backups"
  
  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Registry entries
  WriteRegStr HKLM "Software\BeBoss" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\BeBoss" "Version" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "DisplayName" "BeBoss Desktop ${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "Publisher" "BeBoss Retail Operations"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "DisplayIcon" "$INSTDIR\BeBoss.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "QuietUninstallString" "$\"$INSTDIR\Uninstall.exe$\" /S"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "NoRepair" 1
  
  ; Calculate installed size
  ${GetSize} "$INSTDIR" "/S=0K" $0
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss" "EstimatedSize" "$0"
  
SectionEnd

Section "Desktop Shortcut" SecDesktop
  CreateShortcut "$DESKTOP\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
SectionEnd

Section "Start Menu Shortcut" SecStartMenu
  CreateDirectory "$SMPROGRAMS\BeBoss"
  CreateShortcut "$SMPROGRAMS\BeBoss\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  CreateShortcut "$SMPROGRAMS\BeBoss\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
SectionEnd

Section "Register .bbbackup files" SecAssoc
  WriteRegStr HKCR ".bbbackup" "" "BeBoss.BackupFile"
  WriteRegStr HKCR "BeBoss.BackupFile" "" "BeBoss Backup File"
  WriteRegStr HKCR "BeBoss.BackupFile\DefaultIcon" "" "$INSTDIR\BeBoss.exe,0"
  WriteRegStr HKCR "BeBoss.BackupFile\shell\open\command" "" '"$INSTDIR\BeBoss.exe" "restore" "%1"'
SectionEnd

Section "Post-Install Configuration" SecPost
  ; Configure Windows Firewall for network sync
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="BeBoss Desktop" dir=in action=allow program="$INSTDIR\BeBoss.exe" enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="BeBoss Desktop" dir=out action=allow program="$INSTDIR\BeBoss.exe" enable=yes'
  
  ; Create first-run marker
  FileOpen $0 "$INSTDIR\data\.first-run" w
  FileWrite $0 "${VERSION}"
  FileClose $0
  
SectionEnd

; Uninstall Section
Section "Uninstall"
  ; Remove shortcuts
  Delete "$DESKTOP\BeBoss Desktop.lnk"
  Delete "$SMPROGRAMS\BeBoss\*.*"
  RMDir "$SMPROGRAMS\BeBoss"
  
  ; Remove files
  Delete "$INSTDIR\BeBoss.exe"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\README.md"
  
  ; Remove directories (preserve data)
  RMDir "$INSTDIR\logs"
  RMDir "$INSTDIR\backups"
  MessageBox MB_YESNO "Remove all shop data and backups?$\n$\nSelect 'No' to keep your data for future reinstallation." IDYES RemoveData IDNO KeepData
  
RemoveData:
  RMDir /r "$INSTDIR\data"
  RMDir /r "$INSTDIR\backups"
  
KeepData:
  ; Remove registry entries
  DeleteRegKey HKLM "Software\BeBoss"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss"
  DeleteRegKey HKCR ".bbbackup"
  DeleteRegKey HKCR "BeBoss.BackupFile"
  
  ; Remove firewall rules
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop"'
  
  ; Remove install directory
  RMDir "$INSTDIR"
SectionEnd

; Custom Requirements Page
Function RequirementsPage
  !insertmacro MUI_HEADER_TEXT "System Requirements" "Checking your system compatibility"
  
  nsDialogs::Create 1018
  Pop $0
  
  ${If} $0 == error
    Abort
  ${EndIf}
  
  ${NSD_CreateLabel} 0 10u 100% 35u "BeBoss Desktop is checking your system requirements...$\r$\n$\r$\n\
Windows 10 or later is required for optimal performance."
  Pop $1
  
  ${NSD_CreateGroupBox} 0 50u 100% 80u "System Check"
  Pop $2
  
  ${NSD_CreateLabel} 10u 65u 90% 50u $RequirementsText
  Pop $3
  
  ; Run checks
  StrCpy $RequirementsText ""
  StrCpy $RequirementsOK "1"
  
  ; Check Windows version
  ${If} ${AtLeastWin10}
    StrCpy $RequirementsText "✓ Windows Version: OK$\r$\n"
  ${Else}
    StrCpy $RequirementsText "✗ Windows Version: Requires Windows 10+$\r$\n"
    StrCpy $RequirementsOK "0"
  ${EndIf}
  
  ; Check architecture
  ${If} ${RunningX64}
    StrCpy $RequirementsText "$RequirementsText✓ Architecture: x64$\r$\n"
  ${Else}
    StrCpy $RequirementsText "$RequirementsText✗ Architecture: x64 required$\r$\n"
    StrCpy $RequirementsOK "0"
  ${EndIf}
  
  ; Check RAM
  ${If} ${AtLeastWin10}
    System::Alloc 64
    Pop $4
    System::Call "kernel32::GlobalMemoryStatusEx(i)i.r5"
    ${If} $5 <> 0
      System::Call "*$4(i.r6, i.r7, l.r8, l.r9, l.r10, l.r11, l.r12, l.r13, l.r14)"
      System::Free $4
      
      ; Check if 4GB+ (values in KB)
      ${If} $8 L> 4194304
        StrCpy $RequirementsText "$RequirementsText✓ RAM: $8 KB available$\r$\n"
      ${Else}
        StrCpy $RequirementsText "$RequirementsText⚠ RAM: 4GB+ recommended for large catalogs$\r$\n"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  
  ; WebView2 status
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  
  ${If} $0 != ""
    StrCpy $RequirementsText "$RequirementsText✓ WebView2 Runtime: $0$\r$\n"
  ${Else}
    StrCpy $RequirementsText "$RequirementsText⚠ WebView2: Will be installed automatically$\r$\n"
  ${EndIf}
  
  ; VC++ Runtime
  ${If} ${RunningX64}
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${Else}
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x86" "Installed"
  ${EndIf}
  
  ${If} $0 == "1"
    StrCpy $RequirementsText "$RequirementsText✓ Visual C++ Runtime: Installed$\r$\n"
  ${Else}
    StrCpy $RequirementsText "$RequirementsText⚠ Visual C++: Will be installed automatically$\r$\n"
  ${EndIf}
  
  ; Update label
  SetCtlColors $3 000000 transparent
  
  nsDialogs::Show
FunctionEnd

Function RequirementsPageLeave
  ${If} $RequirementsOK == "0"
    MessageBox MB_ICONSTOP "Your system does not meet the minimum requirements for BeBoss Desktop.$\n$\nPlease upgrade your system and try again."
    Abort
  ${EndIf}
FunctionEnd

Function CheckWebView2
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  
  ${If} $0 == ""
    DetailPrint "Installing WebView2 Runtime..."
    SetOutPath "$TEMP"
    ; Download and install WebView2 bootstrapper
    NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    Pop $0
    ${If} $0 == "success"
      ExecWait '"$TEMP\MicrosoftEdgeWebview2Setup.exe" /silent /install' $1
      Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
      DetailPrint "WebView2 Runtime installed successfully."
    ${Else}
      MessageBox MB_ICONEXCLAMATION "Could not install WebView2 automatically.$\n$\nPlease install it manually from:$\nhttps://developer.microsoft.com/en-us/microsoft-edge/webview2/"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function CheckVCppRuntime
  ${If} ${RunningX64}
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  
  ${If} $0 != "1"
    DetailPrint "Installing Visual C++ Runtime..."
    SetOutPath "$TEMP"
    ; VC++ 2022 Redistributable
    NSISdl::download "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$TEMP\vc_redist.x64.exe"
    Pop $0
    ${If} $0 == "success"
      ExecWait '"$TEMP\vc_redist.x64.exe" /quiet /norestart' $1
      Delete "$TEMP\vc_redist.x64.exe"
      DetailPrint "Visual C++ Runtime installed successfully."
    ${EndIf}
  ${EndIf}
FunctionEnd

; Section Descriptions
LangString DESC_SecMain ${LANG_ENGLISH} "Install BeBoss Desktop application (required)"
LangString DESC_SecDesktop ${LANG_ENGLISH} "Create a desktop shortcut for quick access"
LangString DESC_SecStartMenu ${LANG_ENGLISH} "Create Start Menu shortcuts"
LangString DESC_SecAssoc ${LANG_ENGLISH} "Associate .bbbackup files with BeBoss"

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_SecMain)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_SecDesktop)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} $(DESC_SecStartMenu)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAssoc} $(DESC_SecAssoc)
!insertmacro MUI_FUNCTION_DESCRIPTION_END
