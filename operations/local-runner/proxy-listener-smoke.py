"""Observe the proxy network namespace without credentials or network requests."""
import json
import socket
import struct

listeners = []
for family, path in [(socket.AF_INET, '/proc/net/tcp'), (socket.AF_INET6, '/proc/net/tcp6')]:
    with open(path, encoding='ascii') as stream:
        for line in stream.readlines()[1:]:
            fields = line.split()
            address, port = fields[1].split(':')
            if fields[3] != '0A' or int(port, 16) != 3128:
                continue
            assert family == socket.AF_INET, 'IPv6 proxy listener is forbidden'
            listeners.append(socket.inet_ntoa(struct.pack('<I', int(address, 16))))
assert listeners == ['172.30.240.2'], 'proxy must bind only its isolated interface'
print(json.dumps({'onlyIsolatedProxyListener': True, 'wildcardAndIpv6ListenersAbsent': True}))
