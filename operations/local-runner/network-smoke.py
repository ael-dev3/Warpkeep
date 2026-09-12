"""Credential-free isolated-network check; not proof of safe proxy access."""
import json
import pathlib
import socket

routes = pathlib.Path('/proc/net/route').read_text().splitlines()[1:]
assert not any(line.split()[1] == '00000000' for line in routes), 'default route exists'
assert all(line.split()[2] == '00000000' for line in routes), 'gateway route exists'
status = pathlib.Path('/proc/self/status').read_text()
assert 'CapEff:\t0000000000000000' in status
assert 'NoNewPrivs:\t1' in status

# Numeric public destination avoids confusing DNS failure with route isolation.
with socket.socket() as connection:
    connection.settimeout(2)
    try:
        connection.connect(('1.1.1.1', 443))
    except OSError:
        pass
    else:
        raise AssertionError('direct external TCP succeeded')

socket.setdefaulttimeout(2)
try:
    socket.getaddrinfo('api.github.com', 443)
except socket.gaierror:
    pass
else:
    raise AssertionError('external DNS resolved without the proxy')

print(json.dumps({
    'noDefaultRoute': True,
    'noGatewayRoute': True,
    'noEffectiveCapabilities': True,
    'noNewPrivileges': True,
    'directExternalTcpDenied': True,
    'externalDnsDenied': True,
}))
