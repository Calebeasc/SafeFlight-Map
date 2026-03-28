; ============================================================================
;  Invincible.Inc — User App Installer  (Inno Setup 6)
;  Build:  iscc installer\user\installer.iss   (from repo root)
; ============================================================================

#define AppName      "Invincible.Inc"
#define AppVersion   "1.0"
#define AppPublisher "Invincible.Inc"
#define AppExeName   "InvincibleInc.exe"
#define AppMutex     "InvincibleIncSingleInstance"

[Setup]
AppId={{B1C9D4E2-5F8A-4B2E-A7D3-F1E6C8A09B34}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}.0.0
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} Setup
VersionInfoCompany={#AppPublisher}

DefaultDirName={autopf}\Invincible.Inc
DefaultGroupName=Invincible.Inc
OutputDir={#SourcePath}..\..\dist_installer
OutputBaseFilename=Invincible_Setup_v{#AppVersion}

WizardStyle=modern
WizardImageFile={#SourcePath}wizard_banner.bmp
WizardSmallImageFile={#SourcePath}wizard_small.bmp
WizardSizePercent=130

Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; WiFi scanning requires admin
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
english.WelcomeLabel2=This will install [name] version [ver] on your computer.%n%nInvincible.Inc is a full WiFi and Bluetooth scanner with live GPS mapping, encounter detection, and real-time alerts.%n%nAdministrator access is required for WiFi scanning — Windows will prompt you automatically on first launch.%n%nClick Next to continue, or Cancel to exit Setup.
english.FinishedLabel=Invincible.Inc has been installed successfully.%n%nThe app will request Administrator access on first launch (needed for WiFi scanning). Scan data is stored in:%n  %%USERPROFILE%%\SafeFlightMap\%n%nThe app runs in the system tray — look for the radar icon after launch.

[Tasks]
Name: "desktopicon";   Description: "Create a &desktop shortcut";                GroupDescription: "Shortcuts:";      Flags: checked
Name: "startmenuicon"; Description: "Create a Start &Menu shortcut";             GroupDescription: "Shortcuts:";      Flags: checked
Name: "autostart";     Description: "Launch &automatically when Windows starts"; GroupDescription: "Startup options:"; Flags: unchecked

[Files]
Source: "{#SourcePath}..\..\user_app\dist\InvincibleInc\*"; \
    DestDir: "{app}"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
; Auto-start on boot (only if the user checked the task)
Root: HKCU; \
    Subkey:    "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; \
    ValueName: "InvincibleInc"; \
    ValueData: """{app}\{#AppExeName}"""; \
    Flags:     uninsdeletevalue; \
    Tasks:     autostart

[Icons]
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExeName}"; Tasks: startmenuicon
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}";      Tasks: startmenuicon
Name: "{commondesktop}\{#AppName}";   Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

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
  if RegQueryStringValue(HKCU,
      'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B1C9D4E2-5F8A-4B2E-A7D3-F1E6C8A09B34}_is1',
      'UninstallString', Uninstaller) then
  begin
    if RegQueryStringValue(HKCU,
        'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B1C9D4E2-5F8A-4B2E-A7D3-F1E6C8A09B34}_is1',
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
