; ============================================================================
;  Invincible.Inc Scanner — Inno Setup 6 Installer Script
;  Build:  iscc installer\installer.iss   (from repo root)
; ============================================================================

#define AppName      "Invincible.Inc Scanner"
#define AppVersion   "1.1"
#define AppPublisher "Invincible.Inc"
#define AppExeName   "InvincibleInc.exe"
#define AppMutex     "InvincibleIncSingleInstance"

[Setup]
; ── Identity ─────────────────────────────────────────────────────────────────
AppId={{A3F8B2C1-4D7E-4A1F-9C3B-E2F0D6A85B12}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}.0.0
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} Setup
VersionInfoCompany={#AppPublisher}
VersionInfoCopyright=Copyright (C) 2026 Invincible.Inc

; ── Directories ──────────────────────────────────────────────────────────────
DefaultDirName={autopf}\Invincible.Inc
DefaultGroupName=Invincible.Inc
OutputDir={#SourcePath}..\dist_installer
OutputBaseFilename=InvincibleInc_Setup_v{#AppVersion}

; ── Wizard appearance ─────────────────────────────────────────────────────────
WizardStyle=modern
WizardImageFile={#SourcePath}wizard_banner.bmp
WizardSmallImageFile={#SourcePath}wizard_small.bmp
WizardSizePercent=130

; ── Icon ─────────────────────────────────────────────────────────────────────
SetupIconFile={#SourcePath}icon.ico
UninstallDisplayIcon={app}\{#AppExeName}

; ── License ──────────────────────────────────────────────────────────────────
LicenseFile={#SourcePath}license.txt

; ── Compression ──────────────────────────────────────────────────────────────
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; ── Privileges & compatibility ────────────────────────────────────────────────
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; ── Uninstaller ───────────────────────────────────────────────────────────────
UninstallDisplayName={#AppName}
CreateUninstallRegKey=yes

; ── Misc ─────────────────────────────────────────────────────────────────────
AppMutex={#AppMutex}
CloseApplications=yes
CloseApplicationsFilter={#AppExeName}
RestartApplications=no
DisableDirPage=no
DisableProgramGroupPage=no
AlwaysShowDirOnReadyPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.WelcomeLabel2=This will install [name] version [ver] on your computer.%n%nInvincible.Inc Scanner maps nearby WiFi and BLE devices in real time, logs GPS routes, and alerts you when known devices are detected nearby.%n%nWiFi scanning requires Npcap and Administrator access.%n%nClick Next to continue, or Cancel to exit Setup.
english.FinishedLabel=Setup has finished installing [name] on your computer.%n%nYour scan data is stored in:%n  %%USERPROFILE%%\SafeFlightMap\%n%nThe app runs in the system tray — look for the radar icon after launch.

[Tasks]
Name: "desktopicon";   Description: "Create a &desktop shortcut";                GroupDescription: "Shortcuts:";      Flags: checked
Name: "startmenuicon"; Description: "Create a Start &Menu shortcut";             GroupDescription: "Shortcuts:";      Flags: checked
Name: "autostart";     Description: "Launch &automatically when Windows starts"; GroupDescription: "Startup options:"; Flags: unchecked

[Files]
; Copy the entire PyInstaller output folder (built by user.spec)
Source: "{#SourcePath}..\user_app\dist\InvincibleInc\*"; \
    DestDir: "{app}"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExeName}"; Tasks: startmenuicon
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}";      Tasks: startmenuicon
Name: "{commondesktop}\{#AppName}";   Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
; Auto-start on boot (only if the user checked the task)
Root: HKCU; \
    Subkey:    "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; \
    ValueName: "{#AppName}"; \
    ValueData: """{app}\{#AppExeName}"""; \
    Flags:     uninsdeletevalue; \
    Tasks:     autostart

[Run]
Filename: "{app}\{#AppExeName}"; \
    Description: "Launch {#AppName}"; \
    Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM {#AppExeName}"; \
    Flags: runhidden; \
    RunOnceId: "KillBeforeUninstall"

; ── Pascal code ───────────────────────────────────────────────────────────────
[Code]

{ ── Windows 10 1809+ check (WebView2 / Edge requirement) ─────────────────── }
function IsSupportedOS(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major > 10) or
            ((Version.Major = 10) and (Version.Build >= 17763));
end;

{ ── Check for existing installation and offer upgrade ────────────────────── }
function InitializeSetup(): Boolean;
var
  OldVersion: String;
  Uninstaller: String;
  ResultCode: Integer;
begin
  Result := True;

  if not IsSupportedOS() then
  begin
    MsgBox(
      'Invincible.Inc Scanner requires Windows 10 version 1809 or later.' + #13#10 +
      'Please update Windows and try again.',
      mbError, MB_OK);
    Result := False;
    Exit;
  end;

  if RegQueryStringValue(HKLM,
      'Software\Microsoft\Windows\CurrentVersion\Uninstall\{A3F8B2C1-4D7E-4A1F-9C3B-E2F0D6A85B12}_is1',
      'UninstallString', Uninstaller) then
  begin
    if RegQueryStringValue(HKLM,
        'Software\Microsoft\Windows\CurrentVersion\Uninstall\{A3F8B2C1-4D7E-4A1F-9C3B-E2F0D6A85B12}_is1',
        'DisplayVersion', OldVersion) then
    begin
      if OldVersion <> '{#AppVersion}' then
      begin
        if MsgBox(
            'An older version of ' + '{#AppName}' + ' (v' + OldVersion + ') is already installed.' + #13#10 +
            'It will be removed before installing version {#AppVersion}.' + #13#10#13#10 +
            'Continue?',
            mbConfirmation, MB_YESNO) = IDNO then
        begin
          Result := False;
          Exit;
        end;
        Exec(RemoveQuotes(Uninstaller), '/SILENT /NORESTART', '', SW_HIDE,
             ewWaitUntilTerminated, ResultCode);
      end;
    end;
  end;
end;

{ ── Npcap check — warn if not installed ──────────────────────────────────── }
function IsNpcapInstalled(): Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Npcap') or
            FileExists(ExpandConstant('{sys}\wpcap.dll'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Answer: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    if not IsNpcapInstalled() then
    begin
      Answer := MsgBox(
        'WiFi scanning requires Npcap, which was not detected on this system.' + #13#10#13#10 +
        'Without Npcap, WiFi probe-request scanning will be unavailable.' + #13#10 +
        'BLE and GPS features still work without it.' + #13#10#13#10 +
        'Download Npcap now? (Opens npcap.com in your browser)',
        mbInformation, MB_YESNO);
      if Answer = IDYES then
        ShellExec('open', 'https://npcap.com/#download', '', '', SW_SHOW, ewNoWait, Answer);
    end;
  end;
end;

{ ── Show data folder path on the Finish page ─────────────────────────────── }
procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption := CustomMessage('FinishedLabel');
end;
