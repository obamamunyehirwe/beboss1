; BeBoss Desktop NSIS lifecycle hooks.
; Tauri owns the per-user installation registry metadata and application files.
; These hooks only clean up legacy BeBoss-owned Windows integrations. They never
; create broad firewall exceptions or delete the protected shop database.

!include "WinVer.nsh"

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Preparing BeBoss Desktop installation..."
  ; Read the Windows build number directly rather than relying on the
  ; WinVer/LogicLib condition macros in Tauri's generated NSIS script.
  ; Windows 10 starts at build 10240; Windows 11 and Server 2016+ are newer.
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $0 10240 beboss_windows_supported beboss_windows_unsupported beboss_windows_supported
beboss_windows_unsupported:
  MessageBox MB_ICONSTOP "BeBoss Desktop requires Windows 10 / Windows Server 2016 or later.$\n$\nPlease upgrade Windows before installing BeBoss."
  Abort
beboss_windows_supported:
  DetailPrint "Windows requirements verified."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Finalizing BeBoss Desktop installation..."

  ; Remove only the two explicitly named inbound rules created by legacy
  ; BeBoss versions. Current desktop sync uses authenticated outbound HTTPS.
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop Sync"'
  Pop $1
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop"'
  Pop $1

  ; Remove only the obsolete association if it still points to the old
  ; BeBoss-owned ProgID. Never change a user-selected application association.
  ReadRegStr $0 HKCR ".bbbackup" ""
  ${If} $0 == "BeBoss.BackupFile"
    DeleteRegKey HKCR ".bbbackup"
    DeleteRegKey HKCR "BeBoss.BackupFile"
  ${EndIf}

  ; Tauri creates the BeBoss Start Menu application shortcut. Create the
  ; optional desktop shortcut and a direct uninstall shortcut for this user.
  CreateShortcut "$DESKTOP\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  CreateDirectory "$SMPROGRAMS\BeBoss"
  CreateShortcut "$SMPROGRAMS\BeBoss\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0

  DetailPrint "BeBoss Desktop installed for the current Windows user."
  DetailPrint "Application: $INSTDIR\BeBoss.exe"
  DetailPrint "Encrypted business data remains in the user's protected application-data folder."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing BeBoss Desktop application files..."

  ; Remove shortcuts owned by BeBoss. Do not remove the per-user app-data
  ; directory: SQLCipher data, keychain material and local backups are retained.
  Delete "$DESKTOP\BeBoss Desktop.lnk"
  Delete "$SMPROGRAMS\BeBoss\Uninstall.lnk"
  RMDir "$SMPROGRAMS\BeBoss"

  ; Remove legacy BeBoss-owned integrations only.
  ReadRegStr $0 HKCR ".bbbackup" ""
  ${If} $0 == "BeBoss.BackupFile"
    DeleteRegKey HKCR ".bbbackup"
    DeleteRegKey HKCR "BeBoss.BackupFile"
  ${EndIf}
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop Sync"'
  Pop $1
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop"'
  Pop $1
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "BeBoss Desktop was uninstalled. Shop data and backups were preserved."
!macroend

!macro NSIS_HOOK_PREFINISHPAGE
  !ifdef MUI_FINISHPAGE_RUN_NOTCHECKED
    !undef MUI_FINISHPAGE_RUN_NOTCHECKED
  !endif
  !ifdef MUI_FINISHPAGE_RUN_TEXT
    !undef MUI_FINISHPAGE_RUN_TEXT
  !endif
  !define MUI_FINISHPAGE_RUN_TEXT "Launch BeBoss Desktop"
!macroend
