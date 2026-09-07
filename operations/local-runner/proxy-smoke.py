"""Run in the isolated runner network with the credential-free egress proxy."""
import http.client
import json
import socket
import ssl

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
for authority in denied:
    assert connect_status(authority) == 403, authority
assert connect_status('http://api.github.com/', 'GET') == 403

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
