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
  
  ; Tauri stores user data under the platform app_data_dir. The installer must
  ; not create an unrelated second data directory.
  
  ; Register application
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayName" "BeBoss Desktop"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayVersion" "1.3.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "Publisher" "BeBoss Retail Operations"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "DisplayIcon" "$INSTDIR\BeBoss.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop" "NoRepair" 1
  
  ; Remove legacy broad firewall exceptions and the obsolete file association
  ; installed by earlier BeBoss desktop installers. Do not create new rules.
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop Sync"'
  Pop $1
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop"'
  Pop $1
  ReadRegStr $0 HKCR ".bbbackup" ""
  ${If} $0 == "BeBoss.BackupFile"
    DeleteRegKey HKCR ".bbbackup"
    DeleteRegKey HKCR "BeBoss.BackupFile"
  ${EndIf}
  
  ; Create desktop shortcut
  CreateShortcut "$DESKTOP\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  
  ; Create Start Menu entries
  CreateDirectory "$SMPROGRAMS\BeBoss"
  CreateShortcut "$SMPROGRAMS\BeBoss\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  CreateShortcut "$SMPROGRAMS\BeBoss\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
  
  ; Backup files are restored from the authenticated in-app Backup & Recovery
  ; screen, where the owner explicitly selects a local file and enters its key.
  
  DetailPrint "BeBoss Desktop installed successfully."
  DetailPrint "Installation path: $INSTDIR"
  DetailPrint "Click Finish to complete the setup."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing BeBoss Desktop..."
  
  ; Preserve the business database, encrypted credentials, and backups in
  ; Tauri's application-data directory when the program is uninstalled.
  ; Remove shortcuts
  Delete "$DESKTOP\BeBoss Desktop.lnk"
  RMDir /r "$SMPROGRAMS\BeBoss"
  
  ; Remove installer artifacts owned by previous BeBoss releases only.
  ReadRegStr $0 HKCR ".bbbackup" ""
  ${If} $0 == "BeBoss.BackupFile"
    DeleteRegKey HKCR ".bbbackup"
    DeleteRegKey HKCR "BeBoss.BackupFile"
  ${EndIf}
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop Sync"'
  Pop $1
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop"'
  Pop $1

  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeBoss Desktop"

  DetailPrint "BeBoss Desktop has been removed."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "Uninstall complete. Thank you for using BeBoss."
!macroend
