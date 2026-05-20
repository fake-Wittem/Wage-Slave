!include LogicLib.nsh

!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"

!ifndef BUILD_UNINSTALLER
Function WageSlaveUsePreviousInstallDir
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R0 != ""
    StrCpy $INSTDIR "$R0"
  ${EndIf}
  Abort
FunctionEnd

!macro customPageAfterChangeDir
  Page custom WageSlaveUsePreviousInstallDir
!macroend
!endif
