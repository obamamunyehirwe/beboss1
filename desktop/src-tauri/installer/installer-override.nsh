!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

; Custom installer pages
Var WindowsVersion
Var HasWebView2
Var HasVCRedist
Var SetupPhase
Var CurrentProgress

!macro NSIS_HOOK_PREINSTALL
  StrCpy $SetupPhase "PREPARING"
  DetailPrint "Preparing BeBoss Desktop installation..."
  
  ; Check Windows version
  ${If} ${AtLeastWin10}
    StrCpy $WindowsVersion "Windows 10+"
  ${ElseIf} ${AtLeastWin8.1}
    StrCpy $WindowsVersion "Windows 8.1"
  ${Else}
    MessageBox MB_ICONSTOP "BeBoss Desktop requires Windows 10 or later.$\n$\nYour system: $WindowsVersion$\n$\nPlease upgrade your operating system before installing BeBoss."
    Abort
  ${EndIf}
  
  ; Check WebView2 runtime
  DetailPrint "Checking WebView2 runtime..."
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  
  ${If} $0 != ""
    StrCpy $HasWebView2 "YES"
    DetailPrint "WebView2 runtime found: $0"
  ${Else}
    StrCpy $HasWebView2 "NO"
    DetailPrint "WebView2 runtime not found. Will be installed automatically."
  ${EndIf}
  
  ; Check Visual C++ Redistributable
  DetailPrint "Checking Visual C++ Runtime..."
  ${If} ${RunningX64}
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${Else}
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x86" "Installed"
  ${EndIf}
  
  ${If} $0 == "1"
    StrCpy $HasVCRedist "YES"
    DetailPrint "Visual C++ Runtime found"
  ${Else}
    StrCpy $HasVCRedist "NO"
    DetailPrint "Visual C++ Runtime will be installed"
  ${EndIf}
  
  ; Create installation directory
  CreateDirectory "$INSTDIR"
  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\logs"
  
  StrCpy $SetupPhase "INSTALLING"
  DetailPrint "Starting BeBoss Desktop installation..."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $SetupPhase "FINALIZING"
  DetailPrint "Finalizing BeBoss Desktop installation..."
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall BeBoss.exe"
  
  ; Register uninstaller
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayName" "BeBoss Desktop"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayVersion" "1.2.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "Publisher" "BeBoss Retail Operations"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayIcon" "$INSTDIR\BeBoss.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "UninstallString" '"$INSTDIR\Uninstall BeBoss.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "NoRepair" 1
  
  ; Create Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\BeBoss"
  CreateShortcut "$SMPROGRAMS\BeBoss\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  CreateShortcut "$SMPROGRAMS\BeBoss\Uninstall BeBoss.lnk" "$INSTDIR\Uninstall BeBoss.exe" "" "$INSTDIR\Uninstall BeBoss.exe" 0
  
  ; Create Desktop shortcut
  CreateShortcut "$DESKTOP\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  
  ; Configure firewall
  DetailPrint "Configuring Windows Firewall..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="BeBoss Desktop" dir=in action=allow program="$INSTDIR\BeBoss.exe" enable=yes'
  nsExec::Exec 'netsh advfirewall firewall add rule name="BeBoss Desktop" dir=out action=allow program="$INSTDIR\BeBoss.exe" enable=yes'
  
  ; Set file associations
  DetailPrint "Registering file associations..."
  WriteRegStr HKCR ".bbbackup" "" "BeBoss.BackupFile"
  WriteRegStr HKCR "BeBoss.BackupFile" "" "BeBoss Backup File"
  WriteRegStr HKCR "BeBoss.BackupFile\DefaultIcon" "" "$INSTDIR\BeBoss.exe,0"
  WriteRegStr HKCR "BeBoss.BackupFile\shell\open\command" "" '"$INSTDIR\BeBoss.exe" "restore" "%1"'
  
  DetailPrint "BeBoss Desktop installed successfully."
  DetailPrint ""
  DetailPrint "Installation path: $INSTDIR"
  DetailPrint "Click 'Finish' to complete the setup."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing BeBoss Desktop..."
  
  ; Remove shortcuts
  Delete "$DESKTOP\BeBoss Desktop.lnk"
  RMDir /r "$SMPROGRAMS\BeBoss"
  
  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop"
  DeleteRegKey HKCR "BeBoss.BackupFile"
  DeleteRegKey HKCR ".bbbackup"
  
  ; Remove firewall rules
  nsExec::Exec 'netsh advfirewall firewall delete rule name="BeBoss Desktop"'
  
  ; Remove files and directories
  RMDir /r "$INSTDIR"
  
  DetailPrint "BeBoss Desktop has been removed from your computer."
!macroend
