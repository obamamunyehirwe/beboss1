!macro NSIS_HOOK_PREINSTALL
  MessageBox MB_OK|MB_ICONINFORMATION "BeBoss Desktop Setup$\r$\n$\r$\nThis installer adds secure owner sign-in, local-first synchronization, POS, inventory, customers, reports and shop-management tools."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteUninstaller "$INSTDIR\Uninstall BeBoss.exe"
!macroend
