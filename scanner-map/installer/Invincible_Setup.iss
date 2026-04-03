; Invincible_Setup.iss — True One-File Professional Distribution
; Verified by @architect: Solves the _internal / python312.dll pathing failure

[Setup]
AppId={{D3F7A008-0E14-4B34-B299-F5A059D4D801}
AppName=Invincible.Inc
AppVersion=1.1
AppPublisher=Invincible.Inc
; @architect: Forced absolute system path to prevent LoadLibrary errors in Downloads
DefaultDirName=C:\Program Files\InvincibleInc
DisableDirPage=yes
DefaultGroupName=Invincible.Inc
AllowNoIcons=yes
LicenseFile=license.txt
WizardStyle=modern
OutputBaseFilename=Invincible_Setup_v1.1
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Primary: True One-File Standalone Binary
Source: "..\backend\dist\Invincible_User_App.exe"; DestDir: "{app}"; DestName: "InvincibleInc.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\Invincible.Inc"; Filename: "{app}\InvincibleInc.exe"
Name: "{commondesktop}\Invincible.Inc"; Filename: "{app}\InvincibleInc.exe"; Tasks: desktopicon

[Run]
; System Check: Silent VC++ Redist Installation
Filename: "{app}\vc_redist.x64.exe"; Parameters: "/quiet /norestart"; Check: NeedsVCRedist; StatusMsg: "Optimizing System Dependencies..."
Filename: "{app}\InvincibleInc.exe"; Description: "{cm:LaunchProgram,Invincible.Inc}"; Flags: nowait postinstall skipfsentry runascurrentuser

[Code]
function NeedsVCRedist: Boolean;
var
  Version: String;
begin
  // Check for VC++ 2015-2022 (x64)
  Result := not RegQueryStringValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Version);
end;

procedure CurUninstallStepChanged(UninstallStep: TUninstallStep);
begin
  if UninstallStep = usPostUninstall then
  begin
    // @ghost: Zero-Trace Liquidation Protocol
    if MsgBox('Secure Wipe: Do you want to permanently delete all local SIGINT logs and telemetry?', mbConfirmation, MB_YESNO) = idYes then
    begin
      DelTree(ExpandConstant('{userappdata}\SafeFlightMap'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\Invincible'), True, True, True);
      DelTree(ExpandConstant('{temp}\Invincible_Sovereign'), True, True, True);
    end;
  end;
end;
