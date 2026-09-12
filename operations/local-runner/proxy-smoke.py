"""Run in the isolated runner network with the credential-free egress proxy."""
import http.client
import json
import socket
import ssl
import sys
import time

if sys.argv[1:] == ['--ready']:
    for attempt in range(20):
        try:
            with socket.create_connection(('warpkeep-egress', 3128), timeout=1):
                print(json.dumps({'proxyTcpReady': True}))
                sys.exit(0)
        except OSError:
            time.sleep(0.2)
    raise AssertionError('proxy did not become reachable')

if sys.argv[1:] == ['--unavailable']:
    try:
        with socket.create_connection(('warpkeep-egress', 3128), timeout=2):
            raise AssertionError('stopped proxy remained reachable')
    except OSError:
        print(json.dumps({'stoppedProxyUnavailable': True}))
        sys.exit(0)

def connect_status(authority, method='CONNECT'):
    with socket.create_connection(('warpkeep-egress', 3128), timeout=10) as connection:
        connection.sendall(f'{method} {authority} HTTP/1.1\r\nHost: {authority}\r\n\r\n'.encode('ascii'))
        response = http.client.HTTPResponse(connection)
        response.begin()
        return response.status

denied = ['example.com:443', 'api.github.com.example.com:443',
          '127.0.0.1:443', '169.254.169.254:443', '10.0.0.1:443',
          '[::1]:443', '1.1.1.1:443', 'api.github.com:80',
          'api.github.com:22']
if sys.argv[1:] == ['--unauthorized-client']:
    assert connect_status('api.github.com:443') == 403
    print(json.dumps({'unauthorizedClientDenied': True}))
    sys.exit(0)
for authority in denied:
    assert connect_status(authority) == 403, authority
assert connect_status('http://api.github.com/', 'GET') == 403

if sys.argv[1:] == ['--private-resolution']:
    # The harness maps this otherwise-allowed name to a private address in
    # the proxy's hosts file. No TLS connection should be attempted.
    assert connect_status('api.github.com:443') == 403
    print(json.dumps({'deniedCases': len(denied) + 2, 'allowedHostPrivateResolutionDenied': True}))
    sys.exit(0)
assert not sys.argv[1:], 'unsupported smoke mode'

# TLS verification remains end-to-end: no interception or custom trust root.
with socket.create_connection(('warpkeep-egress', 3128), timeout=10) as connection:
    connection.sendall(b'CONNECT api.github.com:443 HTTP/1.1\r\nHost: api.github.com:443\r\n\r\n')
    response = http.client.HTTPResponse(connection)
    response.begin()
    assert response.status == 200
    with ssl.create_default_context().wrap_socket(connection, server_hostname='api.github.com') as tls:
        tls.sendall(b'HEAD / HTTP/1.1\r\nHost: api.github.com\r\nUser-Agent: Warpkeep-credential-free-network-probe\r\nConnection: close\r\n\r\n')
        github = http.client.HTTPResponse(tls)
        github.begin()
        assert github.status == 200
print(json.dumps({'deniedCases': len(denied) + 1, 'githubTlsVerified': True, 'githubStatus': 200}))
