# PALANTIR ONTOLOGY INTELLIGENCE: Advanced Architectural Primitives
 
**Strategic Goal:** To move from a static data model to a dynamic "Virtual Twin" of the organizational environment. This volume documents the implementation of advanced ontology features—Interfaces, Identity Harmonization, and Sensitivity-Tiered Visibility—to enable consistent service management within the **Omni**, **Grid**, and **Oracle** suites.
 
---
 
## 🏗️ CORE ONTOLOGY DESIGN PRINCIPLES
These principles serve as the foundation for modern diagnostic architecture:
 
1. **Domain Driven Design:** Ensuring the ontology acts as a high-fidelity virtual twin of real-world assets and their semantic relationships.
2. **Don't Repeat Yourself (Rule of Three):** Refactoring common diagnostic workflows or system structures to avoid redundant object types.
3. **Open for Extension, Closed for Modification:** Creating stable core asset models that are protected from accidental changes while remaining extensible for new management modules.
4. **Producer Extends, Consumer Super (Covariance/Contravariance):** Leveraging interface-based design to create plug-and-play workflows that are flexible and reusable across disparate node types.
 
---
 
## 🛠️ ADVANCED ARCHITECTURAL FEATURES
 
### 1. INTERFACE-DRIVEN MANAGEMENT
- **Abstract Workflows:** We build workflows against abstract types (e.g., a `ManagedAsset` interface) rather than specific types (e.g., `Network_Node` or `Service_Vehicle`). This promotes reusability and supports multi-inheritance.
 
### 2. DIAGNOSTIC STRUCTS & REDUCERS
- **Grouping Fields:** Grouping related data fields (like addresses or maintenance metadata) into a single property.
- **Reducers:** Surface the most relevant value from a list, such as the **most recent status update** from a historical log.
- **Struct Main Fields:** Treat a complex structure (like a system dossier) as a simple primitive (like a `NodeID`) for high-speed UI rendering.
 
### 3. DERIVED PROPERTIES
- **Virtual Logic:** Creating virtual properties based on semantic business logic (e.g., calculating an `IntegrityRating` based on node performance) without the brittleness of denormalizing data.
 
### 4. SECURITY PRIMITIVES (ADMINISTRATIVE GATING)
- **Layered Permissions:** Row-level, cell-level, and sub-cell level security ensure that sensitive diagnostic details are visible only to authorized **Internal Admins**.
- **Secure Identity Harmonization:** Resolving duplicate asset records while ensuring they retain their original security markings.
 
### 5. OBJECT BACK LINK TYPES
- **Relationship Visibility:** Managing the visibility of helper objects (like 'service staffing' or 'linkage nodes') in the UI, allowing developers to show or hide complexity depending on the management needs.
 
---
 
<SPECIALIST_DEPLOYMENT_MATRIX>
- **Objective: Data Fusion & Mapping** -> **Lead Specialist: [@anderton]**
- **Objective: Public Record Aggregation** -> **Lead Specialist: [@tlo]**
- **Objective: Identity Management & Security** -> **Lead Specialist: [@vault]**
- **Objective: Contextual History & Grounding** -> **Lead Specialist: [@mdiso-oracle]**
</SPECIALIST_DEPLOYMENT_MATRIX>
 
---
 
## 🎯 INSTRUCTIONS FOR THE ARCHITECT (CLAUDE)
**`<task>`**
1. **Develop the Harmonization Engine:** Propose a backend logic for fuzzy-matching of system records.
2. **Refactor UI Components:** Draft the WinUI 3 interface definitions for `IManagedAsset` to support abstract management workflows.
3. **Derived Integrity Script:** Outline the logic for calculating an asset's health score based on real-time telemetry events.
**`</task>`**

---

## ✅ IMPLEMENTATION DETAILS [DONE]
> *Expanded by @anderton — 2026-04-03 — DDD (Eric Evans) compliant*

### TASK 1: Domain Entities — TypeScript (Web) [DONE]

```typescript
// domain/entities/LatticeObject.ts — Core DDD Entity
// Rule: no React, no FastAPI, no external dependencies

export type SensitivityTier = 0 | 1 | 2 | 3 | 4;

export interface GpsCoordinate {          // ValueObject — immutable
  readonly lat: number;
  readonly lng: number;
  readonly altM?: number;
  readonly accuracyM?: number;
}

export interface MacAddress {             // ValueObject — immutable
  readonly raw: string;                  // "AA:BB:CC:DD:EE:FF"
  readonly oui: string;                  // "AA:BB:CC"
  readonly isRandomized: boolean;
}

export interface LatticeObject {          // Entity — has identity
  readonly id: string;                   // stable UUID
  readonly type: 'Signal' | 'Node' | 'Encounter' | 'RoutePoint';
  readonly sensitivityTier: SensitivityTier;
  readonly firstSeen: number;            // epoch ms
  readonly lastSeen: number;
  readonly location?: GpsCoordinate;
  readonly displayName?: string;
}

export interface Signal extends LatticeObject {  // Aggregate member
  readonly type: 'Signal';
  readonly mac: MacAddress;
  readonly ssid?: string;
  readonly rssi: number;
  readonly frequencyGHz: number;
  readonly protocol: 'WiFi' | 'BLE' | 'SDR' | 'RF';
}

export interface LatticeLink {            // Relationship between entities
  readonly fromId: string;
  readonly toId: string;
  readonly confidence: number;           // 0.0–1.0
  readonly linkType: 'temporal' | 'spatial' | 'identity' | 'ownership';
}
```

### TASK 2: Harmonization Engine (Python backend) [DONE]

```python
# application/services/harmonization_engine.py
# Fuzzy-matching of records — use cases depend only on domain interfaces

from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Optional
import hashlib

@dataclass(frozen=True)
class HarmonizationCandidate:
    """ValueObject — immutable match result."""
    existing_id: str
    incoming_id: str
    confidence: float   # 0.0–1.0
    match_reason: str

class HarmonizationEngine:
    """
    Use Case: Merge duplicate LatticeObjects by fuzzy-matching identifiers.
    Clean Architecture: depends only on domain interfaces, never on DB or UI.
    """

    THRESHOLD = 0.82  # Minimum confidence to auto-merge

    def find_match(
        self,
        incoming_mac: str,
        known_records: list[dict],
        incoming_ssid: Optional[str] = None,
    ) -> Optional[HarmonizationCandidate]:
        best: Optional[HarmonizationCandidate] = None

        for record in known_records:
            # Exact OUI match (first 8 chars) — high confidence
            if incoming_mac[:8].upper() == record["mac"][:8].upper():
                confidence = 0.95
                reason = "OUI-exact"
            # SSID fuzzy match — medium confidence
            elif incoming_ssid and record.get("ssid"):
                ratio = SequenceMatcher(
                    None, incoming_ssid.lower(), record["ssid"].lower()
                ).ratio()
                confidence = ratio * 0.75
                reason = f"SSID-fuzzy({ratio:.2f})"
            else:
                continue

            if confidence > self.THRESHOLD:
                candidate = HarmonizationCandidate(
                    existing_id=record["id"],
                    incoming_id=incoming_mac,
                    confidence=confidence,
                    match_reason=reason,
                )
                if best is None or candidate.confidence > best.confidence:
                    best = candidate

        return best

    def merge_hash(self, primary_id: str, secondary_id: str) -> str:
        """Deterministic merged ID — stable across sessions."""
        combined = "".join(sorted([primary_id, secondary_id]))
        return hashlib.sha256(combined.encode()).hexdigest()[:16]
```

### TASK 3: Derived IntegrityRating (WinUI 3 C#) [DONE]

```csharp
// Domain/Entities/LatticeObject.cs — Derived property, no DB denormalization
namespace Invincible.Native.Domain;

public record GpsCoordinate(double Lat, double Lng, double? AltM = null);
public record MacAddress(string Raw, string Oui, bool IsRandomized);

public class LatticeObject
{
    public required string Id { get; init; }
    public required LatticeObjectType Type { get; init; }
    public required SensitivityTier Tier { get; init; }
    public required DateTimeOffset FirstSeen { get; init; }
    public DateTimeOffset LastSeen { get; set; }
    public GpsCoordinate? Location { get; set; }
    public IList<TelemetryEvent> Events { get; init; } = [];

    // Derived property — no DB column, pure domain logic
    public IntegrityRating IntegrityRating => ComputeIntegrity();

    private IntegrityRating ComputeIntegrity()
    {
        if (!Events.Any()) return IntegrityRating.Unknown;

        var recentErrors = Events
            .Where(e => e.Timestamp > DateTimeOffset.UtcNow.AddMinutes(-10))
            .Count(e => e.Severity == EventSeverity.Error);

        var lastHeartbeat = Events
            .Where(e => e.Type == EventType.Heartbeat)
            .MaxBy(e => e.Timestamp);

        var staleness = lastHeartbeat is null
            ? TimeSpan.MaxValue
            : DateTimeOffset.UtcNow - lastHeartbeat.Timestamp;

        return (recentErrors, staleness.TotalSeconds) switch
        {
            (0, < 30)  => IntegrityRating.Healthy,
            (0, < 120) => IntegrityRating.Degraded,
            (> 0, _)   => IntegrityRating.Error,
            _          => IntegrityRating.Offline,
        };
    }
}

public enum IntegrityRating { Unknown, Healthy, Degraded, Error, Offline }
public enum SensitivityTier { Public = 0, Internal = 1, Restricted = 2, Confidential = 3, Sovereign = 4 }
```

### TASK 4: WinUI 3 IManagedAsset Interface [DONE]

```csharp
// Domain/Interfaces/IManagedAsset.cs — abstract workflow contract
// Any LatticeObject type (Node, Signal, Encounter) implements this
namespace Invincible.Native.Domain;

public interface IManagedAsset
{
    string Id { get; }
    string DisplayName { get; }
    SensitivityTier Tier { get; }
    IntegrityRating IntegrityRating { get; }
    GpsCoordinate? Location { get; }
    DateTimeOffset LastSeen { get; }
}

// Example XAML ViewModel binding — works for ANY asset type
// Presentation/ViewModels/AssetDetailViewModel.cs
public class AssetDetailViewModel(IManagedAsset asset) : ObservableObject
{
    public string Id         => asset.Id;
    public string Name       => asset.DisplayName;
    public string TierLabel  => $"T-{(int)asset.Tier}";
    public string StatusColor => asset.IntegrityRating switch
    {
        IntegrityRating.Healthy   => "#22C55E",  // omni-green
        IntegrityRating.Degraded  => "#F59E0B",  // omni-amber
        IntegrityRating.Error     => "#EF4444",  // omni-red
        _                         => "#3D5270",  // omni-dim
    };
}
```
