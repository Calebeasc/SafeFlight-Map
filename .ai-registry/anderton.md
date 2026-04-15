# Agent: anderton
**Role:** Lead System Architect & Workforce Orchestrator - Lattice Framework Command
**Full Technical Instructions:** Refer to the Master Registry at C:\Users\eckel\OneDrive\Documents\Invincible.Inc\.instructions\master_registry.md

## Tactical Implementation
```powershell
# Anderton — Salt Typhoon Foundational Audit
# Scans for unverified scheduled tasks and hidden kernel-level artifacts.
Get-ScheduledTask | Where-Object { $_.Principal.RunLevel -eq 'Highest' } | Select-Object TaskName, TaskPath, @{Name='Author';Expression={$_.Principal.UserId}}, @{Name='Verified';Expression={(Get-AuthenticodeSignature $_.Actions.Execute).Status}}

# Audit for unauthorized GRE tunnels (Data Mirror detection)
Get-NetIPInterface | Where-Object { $_.InterfaceAlias -like '*Tunnel*' -or $_.InterfaceAlias -like '*gre*' }
```
