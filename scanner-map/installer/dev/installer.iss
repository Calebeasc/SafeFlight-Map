; ============================================================================
;  DevInvincible.Inc — Operator App Installer  (Inno Setup 6)
;  Build:  iscc installer\dev\installer.iss   (from repo root)
; ============================================================================

#define AppName      "DevInvincible.Inc"
#define AppVersion   "1.0"
#define AppPublisher "Invincible.Inc"
#define AppExeName   "DevInvincibleInc.exe"
#define AppMutex     "DevInvincibleIncSingleInstance"

[Setup]
AppId={{C2D8E5F3-6A9B-4C3F-B8E4-A2F7D9B10C45}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}.0.0
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} — Operator Tools Setup
VersionInfoCompany={#AppPublisher}

DefaultDirName={autopf}\DevInvincible.Inc
DefaultGroupName=DevInvincible.Inc
OutputDir={#SourcePath}..\..\dist_installer
OutputBaseFilename=DevInvincible_Setup_v{#AppVersion}

WizardStyle=modern
WizardImageFile={#SourcePath}wizard_banner.bmp
WizardSmallImageFile={#SourcePath}wizard_small.bmp
WizardSizePercent=130

Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; Operator app needs admin for WiFi scanning
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
CreateUninstallRegKey=yes

AppMutex={#AppMutex}
CloseApplications=yes
CloseApplicationsFilter={#AppExeName}
RestartApplications=no

AlwaysShowDirOnReadyPage=yes
DisableProgramGroupPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.WelcomeLabel2=This will install [name] version [ver] on your computer.%n%nDevInvincible.Inc is the full operator toolkit — WiFi & BLE scanning, GPS route recording, encounter detection, multi-user management, and the developer control panel.%n%nAdministrator access is required for WiFi scanning. Windows will prompt you automatically on first launch.%n%nClick Next to continue, or Cancel to exit Setup.
english.FinishedLabel=DevInvincible.Inc has been installed successfully.%n%nThe app will request Administrator access on first launch (needed for WiFi scanning). Scan data is stored in:%n  %%USERPROFILE%%\SafeFlightMap\%n%nThe app runs in the system tray — look for the radar icon after launch.%n%nAccess the developer panel at:  http://localhost:8742/#dev

[Tasks]
Name: "desktopicon";   Description: "Create a &desktop shortcut";                GroupDescription: "Shortcuts:";      Flags: checked
Name: "startmenuicon"; Description: "Create a Start &Menu shortcut";             GroupDescription: "Shortcuts:";      Flags: checked
Name: "autostart";     Description: "Launch &automatically when Windows starts"; GroupDescription: "Startup options:"; Flags: unchecked

[Files]
Source: "{#SourcePath}..\..\backend\dist\DevInvincibleInc\*"; \
    DestDir: "{app}"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExeName}"; Tasks: startmenuicon
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}";      Tasks: startmenuicon
Name: "{commondesktop}\{#AppName}";   Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
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
    Flags: runhidden; RunOnceId: "KillBeforeUninstall"

[Code]
function InitializeSetup(): Boolean;
var
  OldVersion, Uninstaller: String;
  ResultCode: Integer;
begin
  Result := True;
  if RegQueryStringValue(HKLM,
      'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C2D8E5F3-6A9B-4C3F-B8E4-A2F7D9B10C45}_is1',
      'UninstallString', Uninstaller) then
  begin
    if RegQueryStringValue(HKLM,
        'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C2D8E5F3-6A9B-4C3F-B8E4-A2F7D9B10C45}_is1',
        'DisplayVersion', OldVersion) then
    begin
      if OldVersion <> '{#AppVersion}' then
      begin
        if MsgBox('An existing version (v' + OldVersion + ') will be removed first. Continue?',
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

procedure InitializeWizard();
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  if not ((Version.Major > 10) or ((Version.Major = 10) and (Version.Build >= 17763))) then
  begin
    MsgBox('DevInvincible.Inc requires Windows 10 version 1809 or later.' + #13#10 +
           'Please update Windows and try again.', mbError, MB_OK);
    Abort();
  end;
end;

{ ── WebView2 Runtime check & silent install ─────────────────────────────── }
function WebView2IsInstalled(): Boolean;
var
  Ver: String;
begin
  Result :=
    RegQueryStringValue(HKLM,
      'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
      'pv', Ver) or
    RegQueryStringValue(HKLM,
      'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
      'pv', Ver) or
    RegQueryStringValue(HKCU,
      'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
      'pv', Ver);
end;

procedure InstallWebView2();
var
  BootstrapperPath: String;
  ResultCode: Integer;
begin
  BootstrapperPath := ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe');

  if not DownloadTemporaryFile(
      'https://go.microsoft.com/fwlink/p/?LinkId=2124703',
      'MicrosoftEdgeWebview2Setup.exe', '', ResultCode) then
  begin
    MsgBox('Could not download WebView2 Runtime installer.' + #13#10 +
           'Please install Microsoft Edge or WebView2 manually, then re-run setup.',
           mbError, MB_OK);
    Exit;
  end;

  Exec(BootstrapperPath, '/silent /install', '', SW_HIDE,
       ewWaitUntilTerminated, ResultCode);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption := CustomMessage('FinishedLabel');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    if not WebView2IsInstalled() then
    begin
      WizardForm.StatusLabel.Caption := 'Installing WebView2 Runtime...';
      InstallWebView2();
    end;
  end;
end;
