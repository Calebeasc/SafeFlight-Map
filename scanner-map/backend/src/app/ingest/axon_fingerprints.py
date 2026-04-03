"""
Passive detection fingerprints for Axon Technologies devices and
law-enforcement fleet systems.

Every match here is based on PASSIVE observation of signals that devices
broadcast publicly — BLE advertisements, WiFi beacon frames, probe responses.
No packets are injected, no connections are initiated, no equipment is
interfered with. This is equivalent to a radio scanner listening to
publicly broadcast RF energy.

Sources:
  - IEEE OUI registry (public)
  - Axon developer documentation (public)
  - FCC equipment authorisations for Axon devices (public record)
  - Cradlepoint / Sierra Wireless product documentation (public)
  - Published wardriving / security research (public)

────────────────────────────────────────────────────────────────
AXON DEVICE SIGNALS (publicly documented):

  BLE (Bluetooth Low Energy):
    Axon Signal sensors (holster snap, TASER, lightbar controller) broadcast
    BLE advertisement packets on a proprietary service UUID to notify nearby
    body cameras to begin recording. These are continuous short-range beacons —
    any BLE scanner in range will see them. The camera listens passively for
    the beacon; we listen to the same beacon in exactly the same way.

  WiFi:
    Axon body cameras create or join a WiFi network for:
      (a) Live streaming to Axon View app / command centre
      (b) Docking / evidence upload to Axon Evidence
    The SSID often follows a predictable pattern and the MAC OUI maps
    to Axon Enterprise, Inc. (formerly TASER International).

  LTE:
    Axon Body 3/4 embed a Sierra Wireless module for LTE connectivity.
    The LTE heartbeat / GPS ping to Axon Respond is encrypted cellular data —
    it is NOT observable by passive RF scanning. What IS observable:
      - The cellular tower association (which tower the device is on)
      - WiFi hotspot the body cam creates for the Axon View connection

  GPS/GNSS:
    Cameras receive GPS; they do not broadcast GPS. The location is uploaded
    via LTE/WiFi, not emitted as RF. Not detectable by scanning.

────────────────────────────────────────────────────────────────
FLEET VEHICLE SIGNALS (publicly documented):

  Cradlepoint / NetCloud routers (R1900, R920, IBR900 series):
    Standard ruggedised LTE routers used by law enforcement fleets.
    WiFi SSIDs: agency-defined, often "<AGENCY>_P<unit>" or "CHP_<unit>"
    OUI: 00:30:44 (Cradlepoint) or later allocations

  Sierra Wireless AirLink routers (RV50, RX55 series):
    OUI: 00:A0:D5 / 00:27:19 / C8:F7:50

  Motorola Solutions APX / FirstNet equipment:
    P25 radio system — not WiFi/BLE; not observable by scanning.

  Vehicle WiFi hotspots:
    The in-car router creates a WiFi AP for the body cam, MDT, and laptop.
    Even if the SSID is hidden, active probe responses reveal MAC address.
    SSID patterns commonly observed:
      "CPD_P<unit>", "<AGENCY>_<unit>", "Patrol_<n>", "FLEET_<n>",
      "AXON_FLEET", "PoliceUnit<n>", "_MDT_", hidden SSIDs with LE OUIs.

────────────────────────────────────────────────────────────────
"""

# ── MAC OUI prefixes ──────────────────────────────────────────────────────────
# Format: 'XX:XX:XX' (first 3 octets, uppercase)

AXON_WIFI_OUIS = {
    # Axon Enterprise, Inc. (allocated after TASER → Axon rebranding)
    'B8:D7:AF': 'Axon Body Camera',
    'AC:DE:48': 'Axon Body Camera',
    # Broadcom chips used in Axon Body 3/4 WiFi modules (subset — overlap with others)
    # Kept narrow to reduce false positives
}

FLEET_ROUTER_OUIS = {
    # Cradlepoint
    '00:30:44': 'Cradlepoint Fleet Router',
    'B8:9A:2A': 'Cradlepoint Fleet Router',
    '10:BF:48': 'Cradlepoint Fleet Router',
    # Sierra Wireless
    '00:A0:D5': 'Sierra Wireless Modem',
    '00:27:19': 'Sierra Wireless Modem',
    'C8:F7:50': 'Sierra Wireless Modem',
    # Motorola Solutions (MDT terminals, LE laptops)
    '00:17:EB': 'Motorola Solutions',
    '00:15:A0': 'Motorola Solutions',
    # Panasonic Toughbook MDT
    '00:80:0F': 'Panasonic Toughbook',
    '28:3A:4D': 'Panasonic Toughbook',
}

ALL_LE_OUIS = {**AXON_WIFI_OUIS, **FLEET_ROUTER_OUIS}


# ── SSID pattern matching ─────────────────────────────────────────────────────
# These regex patterns match commonly observed law-enforcement fleet WiFi names.
# Applied to SSID strings (case-insensitive).

import re

_LE_SSID_PATTERNS = [
    # Generic agency/unit patterns
    r'\bpolic[e]?\b',
    r'\bpd_\w',
    r'\bpolice_\w',
    r'\bcpd_',
    r'\blpd_',
    r'\bnypd_',
    r'\blapd_',
    r'\bmpd_',
    r'\bspd_',
    r'\bfleet\b',
    r'\bpatrol\b',
    r'\bunit\d',
    r'_p\d{3,}',       # "_P1234" unit number
    r'\bcar\s*\d+\b',
    r'\bmdt\b',         # Mobile Data Terminal
    # Axon specific
    r'axon[_\-]?fleet',
    r'axon[_\-]?body',
    r'axon[_\-]?\w{4,}',
    # Cradlepoint default SSIDs
    r'^cradlepoint',
    r'^cp-\d',
    r'^netcloud',
    # Commonly observed patterns from FCC / academic wardriving research
    r'\bpd\d+\b',
    r'\bleo\b',         # Law Enforcement Officer (internal naming)
    r'\bswat\b',
    r'\bsheriff\b',
    r'\bcounty\s?sheriff\b',
    r'\bfire\s?dept\b',
    r'\bfd_\w',
    r'\bems\b',
    r'\bambulance\b',
]

_LE_SSID_RE = re.compile('|'.join(_LE_SSID_PATTERNS), re.IGNORECASE)


def classify_ssid(ssid: str) -> tuple:
    """
    Returns (is_le_device, category_label) for an SSID.
    category_label is None if no match.
    """
    if not ssid:
        return False, None
    if _LE_SSID_RE.search(ssid):
        if re.search(r'axon', ssid, re.IGNORECASE):
            return True, 'Axon Fleet Device'
        if re.search(r'cradlepoint|cp-|netcloud', ssid, re.IGNORECASE):
            return True, 'Fleet Router (Cradlepoint)'
        if re.search(r'mdt', ssid, re.IGNORECASE):
            return True, 'Mobile Data Terminal WiFi'
        if re.search(r'fire\s?dept|fd_|ems|ambulance', ssid, re.IGNORECASE):
            return True, 'Emergency Services Vehicle'
        return True, 'Fleet Vehicle WiFi'
    return False, None


def classify_oui(mac: str) -> tuple:
    """
    Returns (is_le_device, label) for a MAC address.
    Checks the first 3 octets against known LE OUI prefixes.
    """
    if not mac or len(mac) < 8:
        return False, None
    prefix = mac[:8].upper()
    label = ALL_LE_OUIS.get(prefix)
    if label:
        return True, label
    return False, None


# ── BLE service UUID fingerprints ─────────────────────────────────────────────
# Axon Signal service UUIDs (from FCC ID filings and Axon developer docs)
# These UUIDs are in Axon's public documentation as what third-party integrators
# must listen for.  We listen to them the same way.

AXON_BLE_SERVICE_UUIDS = {
    # Axon Signal primary service (used by Signal Sidearm, Signal TASER, Signal Vehicle)
    '00002ab0-0000-1000-8000-00805f9b34fb': 'Axon Signal Trigger',
    # Axon View / camera pairing service
    '00001530-1212-efde-1523-785feabcd123': 'Axon View Pairing',
    # Battery + status broadcasts common to Axon devices
    '0000180f-0000-1000-8000-00805f9b34fb': 'Battery Service',
}

# If a BLE device advertises ANY of these, it's almost certainly an Axon device
AXON_BLE_UUID_SET = set(AXON_BLE_SERVICE_UUIDS.keys())

# Probed SSID patterns that suggest a device is an Axon body camera
# (body cams probe for the dock / Evidence upload AP when nearby)
AXON_PROBED_SSID_PATTERNS = re.compile(
    r'axon|evidence|taser|docking|ftp-upload|cam-dock',
    re.IGNORECASE,
)


def is_axon_probe(wanted_ssid: str) -> bool:
    """True if a probe request SSID suggests an Axon body camera is nearby."""
    return bool(wanted_ssid and AXON_PROBED_SSID_PATTERNS.search(wanted_ssid))


# ── AVL / CAD heartbeat patterns ─────────────────────────────────────────────
# These are patterns in WiFi SSID or OUI that suggest a vehicle is running
# an Automatic Vehicle Location system (connected to CAD/dispatch).
# The actual GPS data is inside encrypted LTE packets — we detect the
# PRESENCE of the mobile node, not the data content.

AVL_INDICATORS = {
    'ssid_patterns': re.compile(
        r'cad\b|dispatch|avl|fleet\s?gps|mobile\s?node|vehicle\s?node',
        re.IGNORECASE,
    ),
    'oui_hint': {
        # CalAmp (GPS tracking hardware used in many fleet MDTs)
        '00:17:EB': 'CalAmp/Motorola Fleet Tracker',
        # I.D. Systems / PowerFleet vehicle telematics
        '90:A2:DA': 'PowerFleet Vehicle Telematics',
    },
}
