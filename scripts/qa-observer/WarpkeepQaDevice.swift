import CryptoKit
import Foundation
import Security

private let keyApplicationTag = Data("com.warpkeep.qa-observatory.device-key.v1".utf8)
private let bridgeOrigin = "https://auth.warpkeep.com"
private let challengePath = "/v1/qa/challenge"
private let snapshotPath = "/v1/qa/realm-snapshot"
private let snapshotScope = "realm.snapshot"
private let maximumResponseBytes = 256 * 1024
private let maximumSafeJsonInteger: Int64 = 9_007_199_254_740_991
private let requestTimeoutSeconds: TimeInterval = 8
private let resourceTimeoutSeconds: TimeInterval = 10

private enum QaDeviceError: Error {
    case invalidArguments
    case keyUnavailable
    case secureEnclaveUnavailable
    case invalidPublicKey
    case invalidChallenge
    case challengeExpired
    case signatureFailed
    case networkUnavailable
    case invalidResponse
}

private func base64Url(_ data: Data) -> String {
    data.base64EncodedString()
        .replacingOccurrences(of: "=", with: "")
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
}

private func decodeBase64Url(_ value: String) throws -> Data {
    guard value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else {
        throw QaDeviceError.signatureFailed
    }
    var normalized = value.replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/")
    normalized += String(repeating: "=", count: (4 - normalized.count % 4) % 4)
    guard let data = Data(base64Encoded: normalized) else {
        throw QaDeviceError.signatureFailed
    }
    return data
}

private func jsonData(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
}

private func exactDictionary(_ data: Data, keys: Set<String>) throws -> [String: Any] {
    guard
        data.count <= maximumResponseBytes,
        let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        Set(value.keys) == keys
    else {
        throw QaDeviceError.invalidResponse
    }
    return value
}

private func taggedKeyQuery() -> [String: Any] {
    [
        kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: keyApplicationTag,
        kSecReturnRef as String: true,
        kSecReturnAttributes as String: true,
        // Do not constrain type, class, or token here. Every key carrying the
        // reserved tag must be visible so a software key or duplicate cannot
        // be hidden from the uniqueness check by the query itself.
        kSecMatchLimit as String: kSecMatchLimitAll,
        kSecAttrSynchronizable as String: kSecAttrSynchronizableAny,
        kSecUseDataProtectionKeychain as String: true,
    ]
}

private func exactAttributeBool(_ value: Any?) -> Bool? {
    guard
        let number = value as? NSNumber,
        CFGetTypeID(number) == CFBooleanGetTypeID()
    else { return nil }
    return number.boolValue
}

private func attestPrivateKey(
    _ key: SecKey,
    itemAttributes: [String: Any]? = nil
) throws -> SecKey {
    guard let attributes = SecKeyCopyAttributes(key) as? [String: Any] else {
        throw QaDeviceError.keyUnavailable
    }
    if let itemAttributes {
        guard
            itemAttributes[kSecAttrAccessible as String] as? String
                == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String
        else {
            throw QaDeviceError.keyUnavailable
        }
    }
    guard
        attributes[kSecAttrApplicationTag as String] as? Data == keyApplicationTag,
        attributes[kSecAttrKeyType as String] as? String == kSecAttrKeyTypeECSECPrimeRandom as String,
        attributes[kSecAttrKeyClass as String] as? String == kSecAttrKeyClassPrivate as String,
        exactInt64(attributes[kSecAttrKeySizeInBits as String]) == 256,
        attributes[kSecAttrTokenID as String] as? String == kSecAttrTokenIDSecureEnclave as String,
        exactAttributeBool(attributes[kSecAttrIsPermanent as String]) == true,
        exactAttributeBool(attributes[kSecAttrCanSign as String]) == true,
        SecKeyIsAlgorithmSupported(key, .sign, .ecdsaSignatureMessageX962SHA256)
    else {
        throw QaDeviceError.keyUnavailable
    }

    // Secure Enclave private-key material is non-exportable. A successful
    // private-key export proves this is not the credential we agreed to use.
    var exportError: Unmanaged<CFError>?
    guard SecKeyCopyExternalRepresentation(key, &exportError) == nil else {
        throw QaDeviceError.keyUnavailable
    }
    guard SecKeyCopyPublicKey(key) != nil else {
        throw QaDeviceError.invalidPublicKey
    }
    return key
}

private func existingPrivateKey() throws -> SecKey? {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(taggedKeyQuery() as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard
        status == errSecSuccess,
        let matches = result as? [[String: Any]],
        matches.count == 1,
        let rawKey = matches[0][kSecValueRef as String],
        CFGetTypeID(rawKey as CFTypeRef) == SecKeyGetTypeID()
    else {
        throw QaDeviceError.keyUnavailable
    }
    let key = unsafeDowncast(rawKey as AnyObject, to: SecKey.self)
    return try attestPrivateKey(key, itemAttributes: matches[0])
}

private func createPrivateKey() throws -> SecKey {
    var accessError: Unmanaged<CFError>?
    guard let accessControl = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        [.privateKeyUsage],
        &accessError
    ) else {
        throw QaDeviceError.secureEnclaveUnavailable
    }

    let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
        kSecUseDataProtectionKeychain as String: true,
        kSecPrivateKeyAttrs as String: [
            kSecAttrIsPermanent as String: true,
            kSecAttrApplicationTag as String: keyApplicationTag,
            kSecAttrAccessControl as String: accessControl,
        ],
    ]

    var error: Unmanaged<CFError>?
    guard SecKeyCreateRandomKey(attributes as CFDictionary, &error) != nil else {
        throw QaDeviceError.secureEnclaveUnavailable
    }
    // Re-query by the broad reserved tag and independently attest the stored
    // item. Never operate on the just-created reference without this check.
    guard let storedKey = try existingPrivateKey() else {
        throw QaDeviceError.keyUnavailable
    }
    return storedKey
}

private func requirePrivateKey(createIfMissing: Bool) throws -> SecKey {
    if let key = try existingPrivateKey() { return key }
    guard createIfMissing else { throw QaDeviceError.keyUnavailable }
    return try createPrivateKey()
}

private struct PublicKeyMaterial {
    let x: String
    let y: String
    let thumbprint: String

    var jwk: [String: String] {
        ["crv": "P-256", "kty": "EC", "x": x, "y": y]
    }
}

private func publicKeyMaterial(for privateKey: SecKey) throws -> PublicKeyMaterial {
    guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
        throw QaDeviceError.invalidPublicKey
    }
    var error: Unmanaged<CFError>?
    guard let representation = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
        throw QaDeviceError.invalidPublicKey
    }
    let bytes = [UInt8](representation)
    guard bytes.count == 65, bytes.first == 0x04 else {
        throw QaDeviceError.invalidPublicKey
    }
    let x = base64Url(Data(bytes[1...32]))
    let y = base64Url(Data(bytes[33...64]))
    let canonical = try jsonData(["crv": "P-256", "kty": "EC", "x": x, "y": y])
    let thumbprint = base64Url(Data(SHA256.hash(data: canonical)))
    return PublicKeyMaterial(x: x, y: y, thumbprint: thumbprint)
}

private func readDerLength(_ bytes: [UInt8], index: inout Int) throws -> Int {
    guard index < bytes.count else { throw QaDeviceError.signatureFailed }
    let first = Int(bytes[index])
    index += 1
    if first & 0x80 == 0 { return first }
    let width = first & 0x7f
    guard width > 0, width <= 2, index + width <= bytes.count else {
        throw QaDeviceError.signatureFailed
    }
    guard bytes[index] != 0 else { throw QaDeviceError.signatureFailed }
    var value = 0
    for _ in 0..<width {
        value = (value << 8) | Int(bytes[index])
        index += 1
    }
    guard value >= 0x80, width == 1 || value > 0xff else {
        throw QaDeviceError.signatureFailed
    }
    return value
}

private func readDerInteger(_ bytes: [UInt8], index: inout Int) throws -> [UInt8] {
    guard index < bytes.count, bytes[index] == 0x02 else {
        throw QaDeviceError.signatureFailed
    }
    index += 1
    let length = try readDerLength(bytes, index: &index)
    guard length > 0, index + length <= bytes.count else {
        throw QaDeviceError.signatureFailed
    }
    var integer = Array(bytes[index..<(index + length)])
    index += length
    guard integer.first! & 0x80 == 0 else {
        throw QaDeviceError.signatureFailed
    }
    if integer.count > 1, integer.first == 0 {
        guard integer[1] & 0x80 != 0 else { throw QaDeviceError.signatureFailed }
        integer.removeFirst()
    }
    guard !integer.isEmpty, integer.count <= 32, integer.contains(where: { $0 != 0 }) else {
        throw QaDeviceError.signatureFailed
    }
    return Array(repeating: 0, count: 32 - integer.count) + integer
}

private func rawP256Signature(from der: Data) throws -> Data {
    let bytes = [UInt8](der)
    var index = 0
    guard index < bytes.count, bytes[index] == 0x30 else {
        throw QaDeviceError.signatureFailed
    }
    index += 1
    let sequenceLength = try readDerLength(bytes, index: &index)
    guard sequenceLength == bytes.count - index else {
        throw QaDeviceError.signatureFailed
    }
    let r = try readDerInteger(bytes, index: &index)
    let s = try readDerInteger(bytes, index: &index)
    guard index == bytes.count else { throw QaDeviceError.signatureFailed }
    return Data(r + s)
}

private func sign(_ input: String, with privateKey: SecKey) throws -> String {
    guard input.utf8.count <= 4_096 else { throw QaDeviceError.invalidChallenge }
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(
        privateKey,
        .ecdsaSignatureMessageX962SHA256,
        Data(input.utf8) as CFData,
        &error
    ) as Data? else {
        throw QaDeviceError.signatureFailed
    }
    return base64Url(try rawP256Signature(from: signature))
}

private func runCryptographicSelfTest(privateKey: SecKey) throws {
    let input = "warpkeep-qa-observer-self-test-v1"
    let rawSignature = try decodeBase64Url(try sign(input, with: privateKey))
    guard rawSignature.count == 64, let publicKey = SecKeyCopyPublicKey(privateKey) else {
        throw QaDeviceError.signatureFailed
    }
    var error: Unmanaged<CFError>?
    guard let x963 = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
        throw QaDeviceError.signatureFailed
    }
    let cryptoPublicKey = try P256.Signing.PublicKey(x963Representation: x963)
    let signature = try P256.Signing.ECDSASignature(rawRepresentation: rawSignature)
    guard cryptoPublicKey.isValidSignature(signature, for: Data(input.utf8)) else {
        throw QaDeviceError.signatureFailed
    }
}

private final class BoundedDataDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let expectedURL: URL
    private let maximumBytes: Int
    private let completion: @Sendable (Result<BridgeResponse, Error>) -> Void
    private var data = Data()
    private var response: HTTPURLResponse?
    private var completed = false
    private var session: URLSession?

    init(
        expectedURL: URL,
        maximumBytes: Int,
        completion: @escaping @Sendable (Result<BridgeResponse, Error>) -> Void
    ) {
        self.expectedURL = expectedURL
        self.maximumBytes = maximumBytes
        self.completion = completion
    }

    func retain(_ session: URLSession) {
        self.session = session
    }

    private func finish(_ result: Result<BridgeResponse, Error>) {
        guard !completed else { return }
        completed = true
        completion(result)
        session?.invalidateAndCancel()
        session = nil
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard
            let http = response as? HTTPURLResponse,
            http.url == expectedURL
        else {
            completionHandler(.cancel)
            finish(.failure(QaDeviceError.invalidResponse))
            return
        }
        if let contentLength = http.value(forHTTPHeaderField: "Content-Length") {
            guard
                contentLength.range(of: "^[0-9]+$", options: .regularExpression) != nil,
                let declaredBytes = UInt64(contentLength),
                declaredBytes <= UInt64(maximumBytes)
            else {
                completionHandler(.cancel)
                finish(.failure(QaDeviceError.invalidResponse))
                return
            }
        }
        guard
            http.expectedContentLength < 0
                || http.expectedContentLength <= Int64(maximumBytes)
        else {
            completionHandler(.cancel)
            finish(.failure(QaDeviceError.invalidResponse))
            return
        }
        self.response = http
        completionHandler(.allow)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive bytes: Data
    ) {
        guard response != nil, bytes.count <= maximumBytes - data.count else {
            dataTask.cancel()
            finish(.failure(QaDeviceError.invalidResponse))
            return
        }
        data.append(bytes)
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        guard !completed else { return }
        guard error == nil, let response else {
            finish(.failure(QaDeviceError.networkUnavailable))
            return
        }
        finish(.success(BridgeResponse(data: data, response: response)))
    }
}

private struct BridgeResponse {
    let data: Data
    let response: HTTPURLResponse
}

private func boundedResponse(for request: URLRequest, expectedURL: URL) async throws -> BridgeResponse {
    try await withCheckedThrowingContinuation { continuation in
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        configuration.timeoutIntervalForRequest = requestTimeoutSeconds
        configuration.timeoutIntervalForResource = resourceTimeoutSeconds
        configuration.waitsForConnectivity = false
        configuration.httpMaximumConnectionsPerHost = 1

        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .utility
        let delegate = BoundedDataDelegate(
            expectedURL: expectedURL,
            maximumBytes: maximumResponseBytes
        ) { result in
            continuation.resume(with: result)
        }
        let session = URLSession(
            configuration: configuration,
            delegate: delegate,
            delegateQueue: queue
        )
        delegate.retain(session)
        session.dataTask(with: request).resume()
    }
}

private func post(path: String, body: Data?) async throws -> BridgeResponse {
    guard let url = URL(string: bridgeOrigin + path), url.scheme == "https", url.host == "auth.warpkeep.com" else {
        throw QaDeviceError.networkUnavailable
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = requestTimeoutSeconds
    request.httpShouldHandleCookies = false
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
    if let body {
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    } else {
        request.setValue("0", forHTTPHeaderField: "Content-Length")
    }

    let bounded: BridgeResponse
    do {
        bounded = try await boundedResponse(for: request, expectedURL: url)
    } catch {
        throw QaDeviceError.networkUnavailable
    }
    let http = bounded.response
    guard
        bounded.data.count <= maximumResponseBytes,
        http.url == url,
        http.statusCode >= 200,
        http.statusCode < 300,
        http.value(forHTTPHeaderField: "Content-Type")?.lowercased().hasPrefix("application/json") == true,
        http.value(forHTTPHeaderField: "Cache-Control")?.lowercased().contains("no-store") == true
    else {
        throw QaDeviceError.invalidResponse
    }
    return BridgeResponse(data: bounded.data, response: http)
}

private struct DeviceChallenge {
    let requestId: String
    let challenge: String
    let expiresAt: Int64
    let keyThumbprint: String
    let signingInput: String
}

private func constantTimeEqual(_ left: String, _ right: String) -> Bool {
    let leftBytes = Array(left.utf8)
    let rightBytes = Array(right.utf8)
    var difference = UInt(leftBytes.count ^ rightBytes.count)
    let count = max(leftBytes.count, rightBytes.count)
    for index in 0..<count {
        let leftByte = index < leftBytes.count ? leftBytes[index] : 0
        let rightByte = index < rightBytes.count ? rightBytes[index] : 0
        difference |= UInt(leftByte ^ rightByte)
    }
    return difference == 0
}

private func exactInt64(_ value: Any?) -> Int64? {
    guard let number = value as? NSNumber else { return nil }
    if CFGetTypeID(number) == CFBooleanGetTypeID() { return nil }
    let double = number.doubleValue
    guard
        double.isFinite,
        double.rounded(.towardZero) == double,
        double >= Double(Int64.min),
        double <= Double(Int64.max)
    else { return nil }
    let integer = number.int64Value
    return Double(integer) == double ? integer : nil
}

private func exactBool(_ value: Any?) -> Bool? {
    guard
        let number = value as? NSNumber,
        CFGetTypeID(number) == CFBooleanGetTypeID()
    else { return nil }
    return number.boolValue
}

private func parseChallenge(_ data: Data, expectedThumbprint: String) throws -> DeviceChallenge {
    let value = try exactDictionary(data, keys: [
        "version", "requestId", "challenge", "expiresAt", "keyThumbprint", "scope", "signingInput",
    ])
    guard
        exactInt64(value["version"]) == 1,
        value["scope"] as? String == snapshotScope,
        let requestId = value["requestId"] as? String,
        let challenge = value["challenge"] as? String,
        let expiresAt = exactInt64(value["expiresAt"]),
        let keyThumbprint = value["keyThumbprint"] as? String,
        let signingInput = value["signingInput"] as? String,
        requestId.range(of: "^[A-Za-z0-9_-]{16,128}$", options: .regularExpression) != nil,
        challenge.range(of: "^[A-Za-z0-9_-]{32,128}$", options: .regularExpression) != nil,
        keyThumbprint == expectedThumbprint,
        keyThumbprint.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
        signingInput.utf8.count <= 4_096
    else {
        throw QaDeviceError.invalidChallenge
    }
    let now = Int64(Date().timeIntervalSince1970 * 1_000)
    guard expiresAt > now, expiresAt - now <= 60_000 else {
        throw QaDeviceError.challengeExpired
    }

    // The helper never signs arbitrary bytes. Reconstruct the exact canonical
    // message rather than trusting the server-echoed signingInput field.
    let expectedSigningInput = [
        "warpkeep-qa-observer-v1",
        "issuer=\(bridgeOrigin)",
        "endpoint=\(snapshotPath)",
        "scope=\(snapshotScope)",
        "requestId=\(requestId)",
        "challenge=\(challenge)",
        "keyThumbprint=\(keyThumbprint)",
        "expiresAt=\(expiresAt)",
    ].joined(separator: "\n")
    guard constantTimeEqual(signingInput, expectedSigningInput) else {
        throw QaDeviceError.invalidChallenge
    }
    return DeviceChallenge(
        requestId: requestId,
        challenge: challenge,
        expiresAt: expiresAt,
        keyThumbprint: keyThumbprint,
        signingInput: signingInput
    )
}

private let forbiddenSnapshotKeys: Set<String> = [
    "fid", "identity", "admission", "ownership", "terms", "wallet", "audit",
    "token", "session", "authEpoch", "allowedFid", "pfpUrl", "marksBalanceMicros",
    "totalSnapBurnedMicros", "firstAuthenticatedAt", "admittedAt", "profileUpdatedAt",
]

private func isEcmaScriptWhitespace(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x0009...0x000d, 0x0020, 0x00a0, 0x1680, 0x2000...0x200a,
         0x2028...0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
        return true
    default:
        return false
    }
}

private func isForbiddenSnapshotScalar(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x0000...0x001f, 0x007f...0x009f, 0x061c, 0x200b...0x200f,
         0x202a...0x202e, 0x2060, 0x2066...0x2069, 0xfeff, 0x003c, 0x003e:
        return true
    default:
        return false
    }
}

private func safeSnapshotString(_ value: Any?, maximum: Int) -> String? {
    guard let string = value as? String else { return nil }
    let scalars = string.unicodeScalars
    guard
        !scalars.isEmpty,
        scalars.count <= maximum,
        let first = scalars.first,
        let last = scalars.last,
        !isEcmaScriptWhitespace(first),
        !isEcmaScriptWhitespace(last)
    else { return nil }

    var previousWasWhitespace = false
    for scalar in scalars {
        guard !isForbiddenSnapshotScalar(scalar) else { return nil }
        let isWhitespace = isEcmaScriptWhitespace(scalar)
        guard !(previousWasWhitespace && isWhitespace) else { return nil }
        previousWasWhitespace = isWhitespace
    }
    return string
}

private func optionalSnapshotString(
    _ dictionary: [String: Any],
    key: String,
    maximum: Int
) -> String? {
    guard dictionary.keys.contains(key) else { return "" }
    return safeSnapshotString(dictionary[key], maximum: maximum)
}

private func rejectForbiddenSnapshotKeys(_ value: Any) throws {
    if let dictionary = value as? [String: Any] {
        if dictionary.keys.contains(where: { forbiddenSnapshotKeys.contains($0) }) {
            throw QaDeviceError.invalidResponse
        }
        for child in dictionary.values { try rejectForbiddenSnapshotKeys(child) }
    } else if let array = value as? [Any] {
        for child in array { try rejectForbiddenSnapshotKeys(child) }
    }
}

private func validateSnapshot(_ data: Data) throws -> Data {
    let value = try exactDictionary(data, keys: [
        "version", "protocolVersion", "worldSeed", "worldSeedName", "worldTileCount",
        "worldTileMetaCount", "realm", "castles",
    ])
    guard
        exactInt64(value["version"]) == 1,
        exactInt64(value["protocolVersion"]) == 3,
        exactInt64(value["worldSeed"]) == 3_445_214_658,
        value["worldSeedName"] as? String == "HEGEMONY_GENESIS_001",
        exactInt64(value["worldTileCount"]) == 1_261,
        exactInt64(value["worldTileMetaCount"]) == 1_261,
        let realm = value["realm"] as? [String: Any],
        Set(realm.keys) == [
            "realmId", "numericSeed", "generationVersion", "authoritativeRadius",
            "renderRadius", "playerCapacity",
        ],
        realm["realmId"] as? String == "GENESIS_001",
        exactInt64(realm["numericSeed"]) == 3_445_214_658,
        exactInt64(realm["generationVersion"]) == 2,
        exactInt64(realm["authoritativeRadius"]) == 20,
        exactInt64(realm["renderRadius"]) == 22,
        exactInt64(realm["playerCapacity"]) == 100,
        let castles = value["castles"] as? [[String: Any]],
        !castles.isEmpty,
        castles.count <= 100
    else {
        throw QaDeviceError.invalidResponse
    }
    let castleKeys: Set<String> = [
        "castleId", "tileKey", "q", "r", "level", "name", "canonicalUsername",
        "displayName", "portraitAvailable", "publicBio", "publicStatus",
    ]
    var castleIds = Set<Int64>()
    var tileKeys = Set<String>()
    var previousCastleId: Int64 = 0
    for castle in castles {
        guard Set(castle.keys).isSubset(of: castleKeys) else {
            throw QaDeviceError.invalidResponse
        }
        let required: Set<String> = [
            "castleId", "tileKey", "q", "r", "level", "name", "portraitAvailable", "publicStatus",
        ]
        guard
            required.isSubset(of: Set(castle.keys)),
            let castleId = exactInt64(castle["castleId"]),
            (1...maximumSafeJsonInteger).contains(castleId),
            let q = exactInt64(castle["q"]), (-20...20).contains(q),
            let r = exactInt64(castle["r"]), (-20...20).contains(r),
            max(max(abs(q), abs(r)), abs(-q - r)) <= 20,
            let level = exactInt64(castle["level"]), (1...1_000).contains(level),
            let tileKey = safeSnapshotString(castle["tileKey"], maximum: 32),
            tileKey == "\(q),\(r)",
            safeSnapshotString(castle["name"], maximum: 80) != nil,
            exactBool(castle["portraitAvailable"]) != nil,
            let publicStatus = safeSnapshotString(castle["publicStatus"], maximum: 16),
            publicStatus == "founded" || publicStatus == "active",
            let canonicalUsername = optionalSnapshotString(
                castle, key: "canonicalUsername", maximum: 64
            ),
            canonicalUsername.isEmpty || canonicalUsername.range(
                of: "^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$",
                options: .regularExpression
            ) != nil,
            optionalSnapshotString(castle, key: "displayName", maximum: 80) != nil,
            optionalSnapshotString(castle, key: "publicBio", maximum: 320) != nil,
            !castleIds.contains(castleId),
            !tileKeys.contains(tileKey),
            castleId > previousCastleId
        else {
            throw QaDeviceError.invalidResponse
        }
        castleIds.insert(castleId)
        tileKeys.insert(tileKey)
        previousCastleId = castleId
    }
    try rejectForbiddenSnapshotKeys(value)
    return try jsonData(value)
}

private func implementationSnapshot(_ castles: [[String: Any]]) -> [String: Any] {
    [
        "version": 1,
        "protocolVersion": 3,
        "worldSeed": 3_445_214_658,
        "worldSeedName": "HEGEMONY_GENESIS_001",
        "worldTileCount": 1_261,
        "worldTileMetaCount": 1_261,
        "realm": [
            "realmId": "GENESIS_001",
            "numericSeed": 3_445_214_658,
            "generationVersion": 2,
            "authoritativeRadius": 20,
            "renderRadius": 22,
            "playerCapacity": 100,
        ],
        "castles": castles,
    ]
}

private func implementationCastle(
    id: Int64,
    q: Int64,
    r: Int64,
    username: String = "public-name"
) -> [String: Any] {
    [
        "castleId": id,
        "tileKey": "\(q),\(r)",
        "q": q,
        "r": r,
        "level": 2,
        "name": "Observed Keep",
        "canonicalUsername": username,
        "displayName": "Public Name",
        "portraitAvailable": true,
        "publicBio": "Public profile text.",
        "publicStatus": "active",
    ]
}

private func requireSnapshotRejection(_ snapshot: [String: Any]) throws {
    do {
        _ = try validateSnapshot(try jsonData(snapshot))
    } catch QaDeviceError.invalidResponse {
        return
    }
    throw QaDeviceError.signatureFailed
}

private func runSnapshotValidationImplementationSelfTest() throws {
    let first = implementationCastle(id: 1, q: 0, r: 1)
    let second = implementationCastle(id: 2, q: 1, r: 0, username: "public-name-2")
    _ = try validateSnapshot(try jsonData(implementationSnapshot([first, second])))

    var invalid = first
    invalid["displayName"] = "Trusted\u{202e}exe"
    try requireSnapshotRejection(implementationSnapshot([invalid]))

    invalid = first
    invalid["canonicalUsername"] = "Not-Canonical"
    try requireSnapshotRejection(implementationSnapshot([invalid]))

    invalid = implementationCastle(id: 1, q: 20, r: 20)
    try requireSnapshotRejection(implementationSnapshot([invalid]))

    invalid = first
    invalid["name"] = String(repeating: "n", count: 81)
    try requireSnapshotRejection(implementationSnapshot([invalid]))

    invalid = first
    invalid["publicBio"] = NSNull()
    try requireSnapshotRejection(implementationSnapshot([invalid]))

    invalid = first
    invalid["castleId"] = maximumSafeJsonInteger + 1
    try requireSnapshotRejection(implementationSnapshot([invalid]))

    let descending = implementationCastle(id: 1, q: 1, r: 0)
    try requireSnapshotRejection(implementationSnapshot([second, descending]))

    let duplicateTile = implementationCastle(id: 2, q: 0, r: 1)
    try requireSnapshotRejection(implementationSnapshot([first, duplicateTile]))
}

private func runImplementationSelfTest() throws {
    let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
    ]
    var createError: Unmanaged<CFError>?
    guard
        let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &createError),
        let publicKey = SecKeyCopyPublicKey(privateKey)
    else { throw QaDeviceError.signatureFailed }
    do {
        _ = try attestPrivateKey(privateKey)
        throw QaDeviceError.signatureFailed
    } catch QaDeviceError.keyUnavailable {
        // Expected: the implementation fixture is deliberately a transient
        // software key and must never pass the production key attestation.
    }
    var representationError: Unmanaged<CFError>?
    guard let x963 = SecKeyCopyExternalRepresentation(publicKey, &representationError) as Data? else {
        throw QaDeviceError.signatureFailed
    }
    let cryptoPublicKey = try P256.Signing.PublicKey(x963Representation: x963)
    for index in 0..<256 {
        let input = "warpkeep-qa-observer-adapter-self-test-v1:\(index)"
        let raw = try decodeBase64Url(try sign(input, with: privateKey))
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: raw)
        guard cryptoPublicKey.isValidSignature(signature, for: Data(input.utf8)) else {
            throw QaDeviceError.signatureFailed
        }
    }
    try runSnapshotValidationImplementationSelfTest()
}

private func fetchSnapshot(privateKey: SecKey) async throws -> Data {
    let material = try publicKeyMaterial(for: privateKey)
    let challenge = try parseChallenge(
        try await post(path: challengePath, body: nil).data,
        expectedThumbprint: material.thumbprint
    )
    let signature = try sign(challenge.signingInput, with: privateKey)
    let exchangeBody = try jsonData([
        "requestId": challenge.requestId,
        "signature": signature,
    ])
    return try validateSnapshot(
        try await post(path: snapshotPath, body: exchangeBody).data
    )
}

private func writeStdout(_ data: Data) {
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
}

private func writeStdout(_ value: Any) throws {
    writeStdout(try jsonData(value))
}

@main
private struct WarpkeepQaDevice {
    static func main() async {
        do {
            guard CommandLine.arguments.count == 2 else { throw QaDeviceError.invalidArguments }
            switch CommandLine.arguments[1] {
            case "generate":
                let key = try requirePrivateKey(createIfMissing: true)
                try runCryptographicSelfTest(privateKey: key)
                try writeStdout(["keyPresent": true])
            case "status":
                try writeStdout(["keyPresent": try existingPrivateKey() != nil])
            case "self-test":
                let key = try requirePrivateKey(createIfMissing: false)
                try runCryptographicSelfTest(privateKey: key)
                try writeStdout(["selfTest": true])
            case "self-test-if-present":
                if let key = try existingPrivateKey() {
                    try runCryptographicSelfTest(privateKey: key)
                    try writeStdout(["keyPresent": true, "selfTest": true])
                } else {
                    try writeStdout(["keyPresent": false, "selfTest": false])
                }
            case "implementation-self-test":
                try runImplementationSelfTest()
                try writeStdout(["implementationSelfTest": true])
            case "enrollment-jwk":
                let key = try requirePrivateKey(createIfMissing: false)
                try writeStdout(try publicKeyMaterial(for: key).jwk)
            case "snapshot":
                let key = try requirePrivateKey(createIfMissing: false)
                writeStdout(try await fetchSnapshot(privateKey: key))
            default:
                throw QaDeviceError.invalidArguments
            }
        } catch {
            // Never echo request bodies, challenges, signatures, responses, or
            // platform errors. Operators receive only one static failure line.
            FileHandle.standardError.write(Data("Warpkeep QA device operation failed.\n".utf8))
            Foundation.exit(EXIT_FAILURE)
        }
    }
}
