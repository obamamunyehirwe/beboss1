; BeBoss Desktop — production NSIS install / upgrade / uninstall lifecycle.
; These hooks replace application binaries and shortcuts while preserving ALL
; per-user SQLCipher data, keyring credentials, DPAPI key backups and sync queues.
; The app performs key validation and database migration after installation.

!include "LogicLib.nsh"

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Preparing BeBoss Desktop..."

  ; BeBoss Desktop 1.4.x requires Windows 10 (build 10240) or newer.
  SetRegView 64
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} ${Errors}
    StrCpy $0 ""
  ${EndIf}
  ${If} $0 == ""
    MessageBox MB_ICONSTOP "Windows version could not be verified. BeBoss Desktop requires Windows 10 or later."
    Abort
  ${EndIf}
  ${If} $0 < 10240
    MessageBox MB_ICONSTOP "BeBoss Desktop requires Windows 10 (build 10240) or later.$\r$\n$\r$\nUpdate Windows and run this installer again."
    Abort
  ${EndIf}
  DetailPrint "Windows compatibility check passed."

  ; A same-path install is an in-place application upgrade / repair. The
  ; installer replaces program files, never the user's encrypted business DB.
  IfFileExists "$INSTDIR\BeBoss.exe" 0 beboss_fresh_install
    MessageBox MB_ICONINFORMATION|MB_OKCANCEL "An existing BeBoss Desktop installation was found.$\r$\n$\r$\nContinue to replace the installed application files with this version? Your encrypted local database, protected credentials, pending sync queue and recovery archives will be preserved.$\r$\n$\r$\nBeBoss will verify the database key on its next launch." /SD IDOK IDOK beboss_upgrade_confirmed
    Abort
  beboss_upgrade_confirmed:
    DetailPrint "Existing installation detected. Starting a safe in-place upgrade."
    ; Request a graceful close before replacing a loaded executable. No /F:
    ; the installer does not forcibly terminate the user's active session.
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM BeBoss.exe /T'
    Pop $1
    Sleep 1200
    Goto beboss_preinstall_done
  beboss_fresh_install:
    DetailPrint "Fresh per-user installation selected."
  beboss_preinstall_done:
  DetailPrint "Protected shop data will not be deleted or overwritten by NSIS."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Finalizing BeBoss Desktop..."

  ; Remove only legacy BeBoss-owned inbound firewall rules. Current cloud sync
  ; uses authenticated outbound HTTPS and does not require inbound exceptions.
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop Sync"'
  Pop $1
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BeBoss Desktop"'
  Pop $1

  ; Remove an obsolete file association only when it is still owned by BeBoss.
  ReadRegStr $0 HKCR ".bbbackup" ""
  ${If} $0 == "BeBoss.BackupFile"
    DeleteRegKey HKCR ".bbbackup"
    DeleteRegKey HKCR "BeBoss.BackupFile"
  ${EndIf}

  ; Keep a predictable Start Menu entry and provide a desktop launcher.
  CreateDirectory "$SMPROGRAMS\BeBoss"
  CreateShortcut "$SMPROGRAMS\BeBoss\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0
  CreateShortcut "$SMPROGRAMS\BeBoss\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
  CreateShortcut "$DESKTOP\BeBoss Desktop.lnk" "$INSTDIR\BeBoss.exe" "" "$INSTDIR\BeBoss.exe" 0

  DetailPrint "BeBoss Desktop installation completed."
  DetailPrint "Application files: $INSTDIR"
  DetailPrint "Encrypted shop data and recovery archives: preserved in the current user's app-data directory."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Preparing to remove BeBoss Desktop application files..."
  MessageBox MB_ICONINFORMATION|MB_OKCANCEL "This removes the BeBoss Desktop program and shortcuts only.$\r$\n$\r$\nYour encrypted shop database, protected credentials, pending sync queue and recovery backups will remain on this Windows user account." /SD IDOK IDOK beboss_uninstall_confirmed
  Abort
  beboss_uninstall_confirmed:

  ; Ask the application to exit before removing its executable.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM BeBoss.exe /T'
  Pop $1
  Sleep 1000

  Delete "$DESKTOP\BeBoss Desktop.lnk"
  Delete "$SMPROGRAMS\BeBoss\BeBoss Desktop.lnk"
  Delete "$SMPROGRAMS\BeBoss\Uninstall.lnk"
  RMDir "$SMPROGRAMS\BeBoss"

  ; Never delete APPDATA/LOCALAPPDATA, the SQLCipher database, the OS keyring
  ; entry, the DPAPI key backup or any recovery/outbox archive from NSIS.
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
  DetailPrint "BeBoss Desktop was uninstalled. Protected shop data and backups were preserved."
!macroend

!macro NSIS_HOOK_PREFINISHPAGE
  ; Make first launch the clear default action on the modern finish page.
  !ifdef MUI_FINISHPAGE_RUN
    !undef MUI_FINISHPAGE_RUN
  !endif
  !define MUI_FINISHPAGE_RUN "$INSTDIR\BeBoss.exe"
  !ifdef MUI_FINISHPAGE_RUN_TEXT
    !undef MUI_FINISHPAGE_RUN_TEXT
  !endif
  !define MUI_FINISHPAGE_RUN_TEXT "Launch BeBoss Desktop"
  !ifdef MUI_FINISHPAGE_RUN_NOTCHECKED
    !undef MUI_FINISHPAGE_RUN_NOTCHECKED
  !endif
!macroend
