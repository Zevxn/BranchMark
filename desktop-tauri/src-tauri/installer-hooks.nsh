; SECTION 旧安装目录兼容

!define MUI_CUSTOMFUNCTION_GUIINIT BranchMarkRestoreLegacyInstallDirectory

Function BranchMarkRestoreLegacyInstallDirectory
    Push $0

    ; 新发布者已有路径时，由 Tauri 原有初始化逻辑处理。
    ReadRegStr $0 HKCU "Software\Zevxn\BranchMark" ""
    StrCmp $0 "" 0 restore_done

    ; 只替换首次安装的默认值，保留命令行指定的其他目录。
    StrCmp $INSTDIR "$LOCALAPPDATA\BranchMark" 0 restore_done

    ReadRegStr $0 HKCU "Software\deepconvo\BranchMark" ""
    StrCmp $0 "" restore_done
    StrCpy $INSTDIR $0

    ; 同步新注册表位置，确保旧版本卸载步骤也能取得原安装目录。
    WriteRegStr HKCU "Software\Zevxn\BranchMark" "" $0

    restore_done:
    Pop $0
FunctionEnd

; !SECTION 旧安装目录兼容
