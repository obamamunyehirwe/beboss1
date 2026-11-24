; BeBoss Desktop NSIS Installer Hooks
; This file extends the Tauri NSIS configuration

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Preparing BeBoss Desktop installation..."
  
  ; Verify Windows 10+
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "BeBoss Desktop requires Windows 10 or later.$\n$\nPlease upgrade your operating system before installing BeBoss."
    Abort
  ${EndIf}
  
  DetailPrint "System requirements verified."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Finalizing BeBoss Desktop installation..."
  
  ; Create application data directories
  CreateDirectory "$LOCALAPPDATA\BeBoss"
  CreateDirectory "$LOCALAPPDATA\BeBoss\data"
  CreateDirectory "$LOCALAPPDATA\BeBoss\backups"
  CreateDirectory "$LOCALAPPDATA\BeBoss\logs"
  
  ; Register application
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayName" "BeBoss Desktop"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayVersion" "1.2.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "Publisher" "BeBoss Retail Operations"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayIcon" "$INSTDIR\BeBoss.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "NoRepair" 1
  
  ; Configure firewall for network sync
  nsExec::Exec 'netsh advfirewall firewall add rule name="BeBoss Desktop Sync" dir=in action=allow program="$INSTDIR\BeBoss.exe" enable=yes'
  nsExec::Exec 'netsh advfirewall firewall add rule name="BeBoss Desktop Sync" dir=out action=allow program="$INSTDIR\BeBoss.exe" enable=yes'
  
  ; Create desktop shortcut
  CreateShortcut "$DESKTOP\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  
  ; Create Start Menu entries
  CreateDirectory "$SMPROGRAMS\BeBoss"
  CreateShortcut "$SMPROGRAMS\BeBoss\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  CreateShortcut "$SMPROGRAMS\BeBoss\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
  
  ; Register .bbbackup file association
  WriteRegStr HKCR ".bbbackup" "" "BeBoss.BackupFile"
  WriteRegStr HKCR "BeBoss.BackupFile" "" "BeBoss Backup File"
  WriteRegStr HKCR "BeBoss.BackupFile\DefaultIcon" "" "$INSTDIR\BeBoss.exe,0"
  WriteRegStr HKCR "BeBoss.BackupFile\shell\open\command" "" '\"$INSTDIR\BeBoss.exe\" restore \"%1\"'
  
  DetailPrint "BeBoss Desktop installed successfully."
  DetailPrint "Installation path: $INSTDIR"
  DetailPrint "Click Finish to complete the setup."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing BeBoss Desktop..."
  
  ; Ask user about data preservation
  MessageBox MB_YESNO|MB_ICONQUESTION "Would you like to keep your shop data and backups?$\n$\nSelect 'Yes' to preserve your data for future reinstallation." IDYES KeepData
  
  ; Remove application data
  RMDir /r "$LOCALAPPDATA\BeBoss"
  Goto Continue
  
KeepData:
  DetailPrint "Preserving user data at $LOCALAPPDATA\BeBoss"
  
Continue:
  ; Remove shortcuts
  Delete "$DESKTOP\BeBoss Desktop.lnk"
  RMDir /r "$SMPROGRAMS\BeBoss"
  
  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop"
  DeleteRegKey HKCR ".bbbackup"
  DeleteRegKey HKCR "BeBoss.BackupFile"
  
  ; Remove firewall rules
  nsExec::Exec 'netsh advfirewall firewall delete rule name="BeBoss Desktop Sync"'
  
  DetailPrint "BeBoss Desktop has been removed."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "Uninstall complete. Thank you for using BeBoss."
!macroend
