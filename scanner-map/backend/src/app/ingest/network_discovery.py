"""
Active network discovery — finds devices on the local subnet using
four completely standard, legal discovery protocols:

1. ARP scan (WHO-HAS)
   Sends ARP request to every IP in the local /24 subnet.
   Maps IP addresses → MAC addresses, discovers every device on the LAN
   whether or not it responds to pings. Same as what nmap -sn uses.
   Standard tool used by every network admin.

2. mDNS / Bonjour (multicast DNS — RFC 6762)
   Sends a PTR query for _services._dns-sd._udp.local to 224.0.0.251:5353.
   Apple devices (Mac, iPhone, iPad, Apple TV, HomePod), Chromecasts,
   smart speakers, printers, NAS boxes, and any Bonjour-enabled device
   responds with its service types, hostname, IP, and TXT metadata.
   This is the same protocol that makes your printer auto-appear in macOS.

3. UPnP / SSDP M-SEARCH (SSDP — Simple Service Discovery Protocol)
   Sends an HTTP M-SEARCH to the multicast group 239.255.255.250:1900.
   Smart TVs, Roku/Chromecast/Fire TV, routers, NAS boxes (Synology, QNAP),
   IP cameras, smart home hubs, and media servers (Plex, Jellyfin) respond
   with a Location URL pointing to their full XML device description.
   We follow that URL to get manufacturer, model, serial number, etc.

4. NetBIOS Name Service (NBNS — RFC 1002)
   Broadcasts a name query to the subnet broadcast address on UDP port 137.
   Windows machines respond with their computer name and workgroup.
   Works even when Windows Firewall blocks ICMP (ping).

All four are READ-ONLY query protocols — no modification, no injection
of disruptive frames. Every device on the LAN expects these queries.
"""
import ipaddress
import json
import logging
import re
import socket
import struct
import threading
import time
from typing import Optional, Callable

log = logging.getLogger(__name__)

_running = False
_thread: Optional[threading.Thread] = None

# Discovered devices cache: ip → {mac, hostname, services, device_info, ...}
_discovered: dict = {}
_lock = threading.Lock()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_local_ip_and_subnet() -> tuple:
    """Return (local_ip_str, network_str) for the default interface."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        # Assume /24 subnet
        parts = local_ip.split('.')
        subnet = f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
        return local_ip, subnet
    except Exception:
        return None, None


def _mac_from_arp_reply(data: bytes) -> Optional[str]:
    """Parse sender MAC from ARP reply packet (after Ethernet header)."""
    # ARP packet: op(2) sha(6) spa(4) tha(6) tpa(4)
    if len(data) < 28:
        return None
    # Ethernet header is 14 bytes; ARP starts at byte 14 in raw socket recv
    # But we're parsing the raw ARP payload
    sha = data[8:14]
    return ':'.join(f'{b:02X}' for b in sha)


# ── 1. ARP Scan ───────────────────────────────────────────────────────────────

def _arp_scan(subnet_str: str, local_ip: str):
    """
    Send ARP WHO-HAS for every host in the subnet.
    Uses a raw socket (requires admin/Npcap on Windows) if available,
    falls back to subprocess ping sweep to populate the ARP cache,
    then reads it with 'arp -a'.
    """
    results = {}

    # Strategy A: populate ARP cache via ping sweep, then read arp -a
    # Ping is ICMP — some hosts block it, but it fills the ARP table
    # for those that do respond. For the rest, arp -a still shows them
    # if they've communicated recently.
    try:
        import subprocess
        network = ipaddress.IPv4Network(subnet_str, strict=False)
        hosts   = list(network.hosts())

        # Fire off pings quickly (no wait for reply — just stimulate ARP)
        # Windows: ping -n 1 -w 100 (100ms timeout per host)
        threads = []
        for host in hosts[:254]:
            t = threading.Thread(
                target=lambda h=str(host): subprocess.run(
                    ['ping', '-n', '1', '-w', '100', h],
                    capture_output=True, creationflags=0x08000000,
                ),
                daemon=True,
            )
            t.start()
            threads.append(t)
        # Wait up to 3 seconds for the ping sweep to partially complete
        for t in threads:
            t.join(timeout=3)

        # Read ARP cache
        arp_out = subprocess.run(
            ['arp', '-a'],
            capture_output=True, text=True, timeout=5, creationflags=0x08000000,
        ).stdout

        for line in arp_out.splitlines():
            # Lines like:  192.168.1.5          aa-bb-cc-dd-ee-ff     dynamic
            m = re.match(r'\s*([\d.]+)\s+([0-9a-fA-F-:]{17})\s+(\w+)', line)
            if m:
                ip  = m.group(1)
                mac = m.group(2).replace('-', ':').upper()
                arp_type = m.group(3).lower()
                if arp_type in ('dynamic', 'static') and ip != local_ip:
                    results[ip] = {'mac': mac, 'arp_type': arp_type}

    except Exception as e:
        log.debug('ARP scan error: %s', e)

    with _lock:
        for ip, info in results.items():
            if ip not in _discovered:
                _discovered[ip] = {}
            _discovered[ip].update(info)
            _discovered[ip]['ip'] = ip

    return results


# ── 2. mDNS / Bonjour Discovery ───────────────────────────────────────────────

def _build_mdns_query(qname: str, qtype: int = 12) -> bytes:
    """Build a minimal mDNS query packet. qtype=12 is PTR."""
    transaction_id = 0x0000  # mDNS uses 0
    flags = 0x0000            # standard query
    qdcount = 1

    buf = struct.pack('>HHHHHH', transaction_id, flags, qdcount, 0, 0, 0)
    for part in qname.split('.'):
        enc = part.encode()
        buf += bytes([len(enc)]) + enc
    buf += b'\x00'  # root label
    buf += struct.pack('>HH', qtype, 0x8001)  # QU bit set (unicast response requested)
    return buf


def _parse_mdns_name(data: bytes, offset: int) -> tuple:
    """Parse a DNS name from mDNS packet, handling pointer compression."""
    parts = []
    visited = set()
    while offset < len(data):
        length = data[offset]
        if length == 0:
            offset += 1
            break
        if length & 0xC0 == 0xC0:  # pointer
            if offset + 1 >= len(data):
                break
            ptr = ((length & 0x3F) << 8) | data[offset + 1]
            if ptr in visited:
                break
            visited.add(ptr)
            name, _ = _parse_mdns_name(data, ptr)
            parts.append(name)
            offset += 2
            break
        else:
            offset += 1
            parts.append(data[offset:offset + length].decode('utf-8', errors='replace'))
            offset += length
    return '.'.join(parts), offset


def _mdns_discovery():
    """
    Send _services._dns-sd._udp.local PTR query to 224.0.0.251:5353.
    Collect responses for 3 seconds, parse PTR records into service names.
    """
    MDNS_ADDR = '224.0.0.251'
    MDNS_PORT = 5353
    found = {}

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.settimeout(3.0)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)

        query = _build_mdns_query('_services._dns-sd._udp.local', 12)
        sock.sendto(query, (MDNS_ADDR, MDNS_PORT))

        deadline = time.time() + 3.0
        while time.time() < deadline:
            try:
                data, addr = sock.recvfrom(4096)
                src_ip = addr[0]
                # Very basic PTR record extraction — look for service type names
                text = data.decode('latin-1', errors='replace')
                services = re.findall(r'_[\w-]+\._(?:tcp|udp)', text)
                if services:
                    if src_ip not in found:
                        found[src_ip] = set()
                    found[src_ip].update(services)
            except socket.timeout:
                break
            except Exception:
                pass
    except Exception as e:
        log.debug('mDNS error: %s', e)
    finally:
        try:
            sock.close()
        except Exception:
            pass

    # Second pass: query each discovered service type individually for hostnames
    for ip, services in found.items():
        with _lock:
            if ip not in _discovered:
                _discovered[ip] = {'ip': ip}
            _discovered[ip]['mdns_services'] = list(services)
            # Map well-known service types to device categories
            cats = []
            for s in services:
                if '_airplay' in s: cats.append('apple_airplay')
                if '_homekit' in s: cats.append('apple_homekit')
                if '_companion-link' in s: cats.append('apple_device')
                if '_googlecast' in s: cats.append('chromecast')
                if '_ipp' in s or '_printer' in s: cats.append('printer')
                if '_smb' in s or '_afp' in s: cats.append('nas_or_pc')
                if '_http' in s: cats.append('web_server')
                if '_spotify-connect' in s: cats.append('spotify_speaker')
                if '_daap' in s: cats.append('itunes_media_server')
                if '_plex' in s or '_plexmediasvr' in s: cats.append('plex_server')
                if '_roku' in s: cats.append('roku')
            if cats:
                _discovered[ip]['mdns_categories'] = cats

    return found


# ── 3. UPnP / SSDP Discovery ─────────────────────────────────────────────────

SSDP_SEARCH = (
    'M-SEARCH * HTTP/1.1\r\n'
    'HOST: 239.255.255.250:1900\r\n'
    'MAN: "ssdp:discover"\r\n'
    'ST: ssdp:all\r\n'
    'MX: 2\r\n'
    '\r\n'
)


def _fetch_upnp_description(location_url: str) -> dict:
    """HTTP GET the UPnP device description XML, extract key fields."""
    import urllib.request
    try:
        with urllib.request.urlopen(location_url, timeout=3) as resp:
            xml = resp.read().decode('utf-8', errors='replace')
        info = {}
        for field in ['friendlyName', 'manufacturer', 'manufacturerURL',
                      'modelDescription', 'modelName', 'modelNumber',
                      'modelURL', 'serialNumber', 'UDN', 'deviceType']:
            m = re.search(rf'<{field}[^>]*>([^<]+)</{field}>', xml, re.IGNORECASE)
            if m:
                info[field] = m.group(1).strip()
        return info
    except Exception:
        return {}


def _ssdp_discovery():
    """Multicast M-SEARCH, collect responses, optionally fetch device XML."""
    SSDP_ADDR = '239.255.255.250'
    SSDP_PORT = 1900
    found = {}

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.settimeout(3.0)
        sock.sendto(SSDP_SEARCH.encode(), (SSDP_ADDR, SSDP_PORT))

        deadline = time.time() + 3.0
        while time.time() < deadline:
            try:
                data, addr = sock.recvfrom(4096)
                src_ip = addr[0]
                text = data.decode('utf-8', errors='replace')

                if src_ip not in found:
                    found[src_ip] = {}

                # Extract LOCATION header (points to device description XML)
                loc_m = re.search(r'LOCATION:\s*(\S+)', text, re.IGNORECASE)
                if loc_m:
                    found[src_ip]['upnp_location'] = loc_m.group(1)

                # Extract ST (device type) header
                st_m = re.search(r'(?:^|\r\n)ST:\s*(.+?)(?:\r|\n)', text, re.IGNORECASE)
                if st_m:
                    found[src_ip].setdefault('upnp_types', set()).add(st_m.group(1).strip())

                server_m = re.search(r'SERVER:\s*(.+?)(?:\r|\n)', text, re.IGNORECASE)
                if server_m:
                    found[src_ip]['upnp_server'] = server_m.group(1).strip()

            except socket.timeout:
                break
            except Exception:
                pass
    except Exception as e:
        log.debug('SSDP error: %s', e)
    finally:
        try:
            sock.close()
        except Exception:
            pass

    # Fetch device descriptions for new devices
    for ip, info in found.items():
        loc = info.get('upnp_location')
        if loc:
            desc = _fetch_upnp_description(loc)
            info.update(desc)
        if 'upnp_types' in info:
            info['upnp_types'] = list(info['upnp_types'])

        with _lock:
            if ip not in _discovered:
                _discovered[ip] = {'ip': ip}
            _discovered[ip].update({k: v for k, v in info.items() if k != 'upnp_types' or v})

    return found


# ── 4. NetBIOS Name Service ───────────────────────────────────────────────────

def _nbns_name_request(ip: str) -> Optional[str]:
    """Send a NetBIOS node status request and return the machine name."""
    NBNS_PORT = 137
    # Node status request (RFC 1002 §4.2.18)
    request = (
        b'\x00\x00'   # transaction ID
        b'\x00\x10'   # flags: NB status request
        b'\x00\x01'   # QDCOUNT = 1
        b'\x00\x00\x00\x00\x00\x00'  # ANCOUNT, NSCOUNT, ARCOUNT
        # QNAME: wildcard NetBIOS name *<encoded>
        b'\x20'
        b'CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        b'\x00'
        b'\x00\x21'   # NBSTAT
        b'\x00\x01'   # IN
    )
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(1.0)
        sock.sendto(request, (ip, NBNS_PORT))
        data, _ = sock.recvfrom(1024)
        sock.close()
        # Parse name from response (offset 57, 15 bytes, space-padded)
        if len(data) > 72:
            name = data[57:72].decode('ascii', errors='replace').rstrip(' \x00')
            return name if name else None
    except Exception:
        pass
    return None


def _nbns_sweep(ips: list):
    """Query NetBIOS names for a list of IPs."""
    for ip in ips:
        name = _nbns_name_request(ip)
        if name:
            with _lock:
                if ip not in _discovered:
                    _discovered[ip] = {'ip': ip}
                _discovered[ip]['netbios_name'] = name


# ── Orchestrator ──────────────────────────────────────────────────────────────

def _discovery_loop(gps_fn: Optional[Callable]):
    global _running
    while _running:
        try:
            local_ip, subnet = _get_local_ip_and_subnet()
            if not local_ip:
                time.sleep(30)
                continue

            log.debug('Network discovery starting for subnet %s', subnet)

            # ARP scan first — gives us MACs
            arp_results = _arp_scan(subnet, local_ip)
            known_ips   = list(arp_results.keys())

            # mDNS multicast
            _mdns_discovery()

            # SSDP/UPnP multicast
            _ssdp_discovery()

            # NetBIOS sweep on known IPs
            if known_ips:
                _nbns_sweep(known_ips[:50])  # cap at 50 to avoid being slow

            # Now ingest the combined discovery results
            from app.core.allowlist import hash_identifier
            from app.processing.aggregator import ingest_observation
            from app.ingest.gps_relay import get_fix as _gps_get_fix

            ts_ms = int(time.time() * 1000)
            loc   = gps_fn() if gps_fn else {}

            with _lock:
                for ip, info in list(_discovered.items()):
                    mac = info.get('mac')
                    if not mac:
                        continue
                    target_key = hash_identifier(mac)
                    device_type = 'unknown'
                    cats = info.get('mdns_categories', [])
                    upnp_types = info.get('upnp_types', [])
                    if 'chromecast' in cats:    device_type = 'chromecast'
                    elif 'apple_airplay' in cats or 'apple_device' in cats: device_type = 'apple_device'
                    elif 'printer' in cats:     device_type = 'printer'
                    elif 'roku' in cats:        device_type = 'roku'
                    elif 'plex_server' in cats: device_type = 'media_server'
                    elif 'nas_or_pc' in cats:   device_type = 'computer'
                    elif info.get('netbios_name'): device_type = 'windows_pc'

                    friendly = info.get('friendlyName') or info.get('netbios_name') or ip
                    ingest_observation(
                        target_key=target_key, source='network', ts_ms=ts_ms,
                        rssi=-60,  # placeholder — network devices don't have RSSI
                        lat=loc.get('lat'), lon=loc.get('lon'),
                        speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
                        meta={
                            'device_type':      device_type,
                            'ip':               ip,
                            'mac':              mac,
                            'friendly_name':    friendly,
                            'manufacturer':     info.get('manufacturer'),
                            'model':            info.get('modelName') or info.get('modelDescription'),
                            'serial':           info.get('serialNumber'),
                            'netbios_name':     info.get('netbios_name'),
                            'mdns_services':    info.get('mdns_services', []),
                            'mdns_categories':  cats,
                            'upnp_server':      info.get('upnp_server'),
                            'upnp_types':       upnp_types,
                            'color':            '#00d4ff',
                            'oui_label':        info.get('manufacturer', 'LAN Device'),
                        },
                    )

        except Exception as e:
            log.error('Network discovery error: %s', e)

        # Run every 5 minutes — network layout doesn't change often
        time.sleep(300)


def start(gps_fn=None):
    global _running, _thread
    if _running:
        return
    _running = True
    _thread = threading.Thread(
        target=_discovery_loop, args=(gps_fn,),
        daemon=True, name='network-discovery',
    )
    _thread.start()
    log.info('Network discovery started (ARP + mDNS + SSDP + NetBIOS)')


def stop():
    global _running
    _running = False


def get_discovered() -> dict:
    with _lock:
        return dict(_discovered)
