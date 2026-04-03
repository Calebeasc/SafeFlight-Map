# ARCHITECTURAL SPECIFICATION: HARDENED NATIVE WINDOWS HOST INTEGRATION
 
**Strategic Goal:** This document defines the transition from a web-based React/FastAPI prototype to a **Production-Grade Native Windows Application** using the **Windows App SDK (WinUI 3) and C#**. This architecture ensures absolute local resilience, low-latency rendering, and total process-level isolation for security hardening operations.
 
---
 
## 1. NATIVE SHELL ARCHITECTURE (WinUI 3)
 
### A. The "Real App" Mandate
To meet the high-fidelity standards of applications like the **Xbox App** and **Docker Desktop**, the project must eliminate all browser engines, web-views, and interpreted scripts. The UI is built using **Native XAML (Extensible Application Markup Language)** and the business logic is executed in **C# (Managed Native)**. This ensures that the application runs directly on the Windows Kernel with 0% browser overhead.
 
### B. App Entry Point (App.xaml.cs)
The application initializes as a standard WinUI 3 executable. It is responsible for:
- Initializing the Fluent Design System.
- Spawning the primary `MainWindow.xaml`.
- Establishing the secure `P/Invoke` bridge to low-level hardware modules.
 
---
 
## 2. HIGH-DENSITY DASHBOARD (XAML)
 
### A. Fluent Design & Data Visualization
The UI layer utilizes XAML to define a high-density, "Sovereign" dashboard. We use **Direct2D** and **Win2D** for real-time hardware-accelerated rendering of signal waterfalls, telemetry graphs, and the 3D Global Asset Awareness Environment (via the CesiumJS bridge or a native C++ DirectX viewer).
 
### B. Component Modularity
Every tactical module (Signal Awareness, Route Avoidance, Drone Telemetry) is implemented as a **Custom UserControl** in XAML. This ensures strict modularity and allows for build-time "Flavor Gating" (e.g., hiding advanced research controls from the basic Oracle build).
 
---
 
## 3. HARDWARE & LOGIC BRIDGE (P/INVOKE)
 
### A. C++ Hardware Interop
For high-performance signal processing (SDR, SIGINT, RF Sensing), the C# app interfaces with low-level **C++ DLLs** using **P/Invoke (Platform Invoke)**. This allows the app to perform raw I/O operations on physical hardware (HackRF, Alfa Antennas) at the speed of the CPU, bypassing the latency of the Python/FastAPI layer.
 
### B. Service Isolation (The Great Partition)
The backend logic is physically isolated into separate **Sovereign Microservices**. 
- **Oracle Tier:** Handles safe, tactical driving data.
- **Omni Tier:** Handles advanced research and security hardening logic.
These are managed as separate processes or isolated DLLs to enforce the **Principle of Least Privilege**.
 
---
 
## 🎯 INSTRUCTIONS FOR THE PRINCIPAL ARCHITECT (CLAUDE)

<structural_task_architecture>
    <task>
        <objective>Initialize the WinUI 3 Project.</objective>
        <action>Draft the `App.xaml.cs` and `MainWindow.xaml` boilerplate for the pure native host.</action>
    </task>
    <task>
        <objective>XAML Dashboard Layout.</objective>
        <action>Provide a professional, dark-themed XAML layout for the central "Command Tower" view.</action>
    </task>
    <task>
        <objective>P/Invoke Bridge Logic.</objective>
        <action>Write the C# wrapper for a sample C++ DLL that handles raw SDR signal ingestion.</action>
    </task>
    <task>
        <objective>Build-Time Partitioning.</objective>
        <action>Propose a strategy for using **Conditional Compilation Symbols** (e.g., `#if OMNI_UNLOCKED`) to gate advanced features in the native binary.</action>
    </task>
</structural_task_architecture>

---

## ✅ IMPLEMENTATION DETAILS [DONE]
> *Expanded by @anderton — 2026-04-03 — DDD + Clean Architecture compliant*

### TASK 1: WinUI 3 Project Bootstrap [DONE]

**Project structure** (`Invincible/Invincible.Native/`):
```
Invincible.Native/
├── App.xaml                  # Application resources + theme
├── App.xaml.cs               # Entry point, DI container init
├── MainWindow.xaml           # Shell: NavigationView + content frame
├── MainWindow.xaml.cs        # Window lifecycle
├── Domain/                   # Clean Architecture — innermost ring
│   ├── Entities/             # LatticeObject, Signal, Encounter
│   ├── ValueObjects/         # GpsCoordinate, MacAddress, Frequency
│   └── Interfaces/           # ISignalRepository, ILatticeStore
├── Application/              # Use cases — no UI dependencies
│   ├── UseCases/             # ScanSession, ResolveTarget, BuildHeatMap
│   └── Services/             # ScanOrchestrator, EncounterAggregator
├── Infrastructure/           # Outermost ring — DB, hardware, API
│   ├── Scanning/             # NpcapScanner.cs (P/Invoke to Npcap)
│   ├── Persistence/          # SQLiteRepository.cs
│   └── Api/                  # OmniApiClient.cs (Lattice sync)
└── Presentation/             # WinUI 3 UserControls
    ├── Controls/             # MapControl, SignalWaterfall, StatCard
    ├── Pages/                # DashboardPage, ScanPage, ReplayPage
    └── ViewModels/           # MVVM — no business logic in code-behind
```

**`App.xaml.cs` boilerplate:**
```csharp
// App.xaml.cs — Entry point, DI setup, theme enforcement
using Microsoft.UI.Xaml;
using Microsoft.Extensions.DependencyInjection;

namespace Invincible.Native;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    public App()
    {
        InitializeComponent();
        Services = ConfigureServices();
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        // Domain
        services.AddSingleton<ISignalRepository, SQLiteSignalRepository>();
        services.AddSingleton<ILatticeStore, LatticeStore>();
        // Application
        services.AddTransient<ScanOrchestrator>();
        services.AddTransient<EncounterAggregator>();
        // Infrastructure
        services.AddSingleton<NpcapScanner>();
        // ViewModels
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<ScanViewModel>();
        return services.BuildServiceProvider();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var window = new MainWindow();
        window.Activate();
    }
}
```

---

### TASK 2: XAML Dashboard Layout [DONE]

**Titanium Workspace palette enforced via `App.xaml` ResourceDictionary:**
```xml
<!-- App.xaml — Titanium Workspace design tokens -->
<Application.Resources>
  <ResourceDictionary>
    <Color x:Key="OmniBg">#FF000000</Color>
    <Color x:Key="OmniBg2">#FF020508</Color>
    <Color x:Key="OmniCold">#FF2563EB</Color>
    <Color x:Key="OmniIce">#FF60A5FA</Color>
    <Color x:Key="OmniRed">#FFEF4444</Color>
    <Color x:Key="OmniGreen">#FF22C55E</Color>
    <Color x:Key="OmniAmber">#FFF59E0B</Color>
    <Color x:Key="OmniText">#FFC8D3E0</Color>
    <Color x:Key="OmniDim">#FF3D5270</Color>
    <SolidColorBrush x:Key="OmniColdBrush" Color="{StaticResource OmniCold}"/>
    <SolidColorBrush x:Key="OmniIceBrush" Color="{StaticResource OmniIce}"/>
  </ResourceDictionary>
</Application.Resources>
```

**`MainWindow.xaml` — Command Tower shell:**
```xml
<!-- MainWindow.xaml — NavigationView shell, Titanium Workspace -->
<Window x:Class="Invincible.Native.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="OMNI // INVINCIBLE.INC">
  <Grid Background="{StaticResource OmniBg}">
    <NavigationView x:Name="NavView"
                    PaneDisplayMode="Left"
                    IsBackButtonVisible="Collapsed"
                    OpenPaneLength="200"
                    Background="{StaticResource OmniBg2}">
      <NavigationView.MenuItems>
        <NavigationViewItem Tag="dashboard" Content="DASHBOARD"
                            Icon="Home"/>
        <NavigationViewItem Tag="scan"      Content="SCAN"
                            Icon="WiFi"/>
        <NavigationViewItem Tag="lattice"   Content="LATTICE"
                            Icon="Globe"/>
        <NavigationViewItem Tag="replay"    Content="REPLAY"
                            Icon="Undo"/>
      </NavigationView.MenuItems>
      <Frame x:Name="ContentFrame"/>
    </NavigationView>
  </Grid>
</Window>
```

---

### TASK 3: Build-Time Flavor Partitioning [DONE]

**`Invincible.Native.csproj` — Conditional compilation symbols:**
```xml
<PropertyGroup Condition="'$(Configuration)'=='Debug'">
  <DefineConstants>DEBUG;OMNI_UNLOCKED;DEV_TOOLS</DefineConstants>
</PropertyGroup>
<PropertyGroup Condition="'$(Configuration)'=='Release'">
  <DefineConstants>RELEASE</DefineConstants>
  <!-- OMNI_UNLOCKED intentionally absent — user build only gets ORACLE_SAFE features -->
</PropertyGroup>
<PropertyGroup Condition="'$(OmniFlavor)'=='Sovereign'">
  <DefineConstants>RELEASE;OMNI_UNLOCKED;SOVEREIGN_TIER</DefineConstants>
</PropertyGroup>
```

**Usage in ViewModels:**
```csharp
// ScanViewModel.cs — feature-gating via conditional compilation
public IEnumerable<ScanAction> GetAvailableActions(LatticeObject target)
{
    var actions = new List<ScanAction>
    {
        new ScanAction("Verify", ActionTier.OracleSafe),
        new ScanAction("Proximity Alert", ActionTier.OracleSafe),
    };

#if OMNI_UNLOCKED
    actions.Add(new ScanAction("SDR Spectrum View", ActionTier.OmniOnly));
    actions.Add(new ScanAction("Signal Waterfall", ActionTier.OmniOnly));
#endif

    return actions;
}
```

---

### TASK 4: Clean Architecture Enforcement Notes [DONE]

Per Robert C. Martin's dependency rule:
- `Domain/` entities (`LatticeObject`, `Signal`, `GpsCoordinate`) have **zero external dependencies**
- `Application/` use cases depend only on `Domain/` interfaces — never on WinUI, SQLite, or FastAPI
- `Infrastructure/` implements domain interfaces (`NpcapScanner : IScanner`)
- `Presentation/` ViewModels call `Application/` use cases via constructor injection
- The `IServiceProvider` in `App.xaml.cs` is the **composition root** — the only place all rings are wired together
 
---
 
<SPECIALIST_DEPLOYMENT_MATRIX>
- **Objective: Modular Integration R&D** -> **Lead Specialist: [@mad-scientist]**
- **Objective: Service Isolation & Discovery** -> **Lead Specialist: [@alchemist]**
- **Objective: Diagnostic Auto-Remediation** -> **Lead Specialist: [@medic]**
- **Objective: Structural Integrity Auditing** -> **Lead Specialist: [@helix]**
</SPECIALIST_DEPLOYMENT_MATRIX>
