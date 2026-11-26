package com.beboss.shopmgmt.util

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.EOFException
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.io.InputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Collections
import java.util.Date
import java.util.Locale
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.abs

internal data class LanHttpRequestHead(
    val method: String,
    val path: String,
    val contentLength: Int,
    val headers: Map<String, String>
)

/**
 * Read a bounded HTTP/1.x header block without a character reader. HTTP
 * Content-Length counts octets, so buffering through a Reader before reading
 * the body can consume or miscount UTF-8 data.
 */
internal fun readLanHttpRequestHead(input: InputStream): LanHttpRequestHead {
    val bytes = ByteArrayOutputStream()
    val terminator = byteArrayOf(13, 10, 13, 10)
    while (bytes.size() <= 32 * 4096) {
        val next = input.read()
        if (next < 0) throw EOFException("The LAN peer closed before completing its HTTP headers.")
        bytes.write(next)
        val current = bytes.toByteArray()
        if (current.size >= 4 &&
            current[current.size - 4] == terminator[0] &&
            current[current.size - 3] == terminator[1] &&
            current[current.size - 2] == terminator[2] &&
            current[current.size - 1] == terminator[3]
        ) {
            val text = StandardCharsets.US_ASCII.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(current, 0, current.size - 4))
                .toString()
            val lines = text.split("\\r\\n")
            val requestLine = lines.firstOrNull().orEmpty()
            require(requestLine.length <= 4096) { "The LAN HTTP request line is too large." }
            val requestParts = requestLine.split(' ')
            require(
                requestParts.size == 3 &&
                    requestParts[0].matches(Regex("[A-Z]{1,16}")) &&
                    requestParts[1].startsWith("/") &&
                    requestParts[2] in setOf("HTTP/1.0", "HTTP/1.1")
            ) { "The LAN HTTP request line is invalid." }

            val headers = linkedMapOf<String, String>()
            var declaredLength: Int? = null
            val headerLines = lines.drop(1)
            require(headerLines.size <= 32) { "LAN HTTP header count exceeds the limit." }
            for (line in headerLines) {
                require(line.length <= 4096 && line.isNotBlank()) { "A LAN HTTP header is invalid or too large." }
                val colon = line.indexOf(':')
                require(colon in 1 until line.lastIndex) { "A LAN HTTP header is malformed." }
                val name = line.substring(0, colon).trim().lowercase(Locale.ROOT)
                val value = line.substring(colon + 1).trim()
                require(name.matches(Regex("[a-z0-9-]{1,64}"))) { "A LAN HTTP header name is invalid." }
                if (name == "content-length") {
                    require(declaredLength == null) { "Duplicate Content-Length headers are not accepted." }
                    require(value.matches(Regex("\\d{1,8}"))) { "Content-Length is invalid." }
                    declaredLength = value.toIntOrNull()
                        ?: throw IllegalArgumentException("Content-Length is outside the supported range.")
                }
                require(name != "transfer-encoding") { "Chunked LAN HTTP requests are not supported." }
                headers[name] = value
            }
            return LanHttpRequestHead(
                method = requestParts[0],
                path = requestParts[1],
                contentLength = declaredLength ?: 0,
                headers = headers
            )
        }
    }
    throw IllegalArgumentException("LAN HTTP headers exceed the 128 KB safety limit.")
}

/** Read exactly Content-Length octets and decode them as strict UTF-8. */
internal fun readLanHttpRequestBody(input: InputStream, contentLength: Int, maxBytes: Int): String {
    require(contentLength >= 0) { "Content-Length cannot be negative." }
    require(contentLength <= maxBytes) { "The LAN HTTP body exceeds the configured safety limit." }
    val bytes = ByteArray(contentLength)
    var offset = 0
    while (offset < contentLength) {
        val count = input.read(bytes, offset, contentLength - offset)
        if (count < 0) throw EOFException("The LAN peer closed before the full HTTP body was received.")
        if (count == 0) continue
        offset += count
    }
    return StandardCharsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes))
        .toString()
}

enum class LocalServerStatus {
    STOPPED,
    STARTING,
    RUNNING,
    ERROR
}

data class DiscoveredBranchHub(
    val id: String,
    val shopName: String,
    val branchName: String,
    val ipAddress: String,
    val port: Int,
    val productsCount: Int,
    val salesCount: Int,
    val branchesCount: Int,
    val lastSeenAt: Long = System.currentTimeMillis()
)

data class BranchPeerSyncEvent(
    val id: String = UUID.randomUUID().toString(),
    val peerName: String,
    val peerIp: String,
    val summary: String,
    val timestamp: Long = System.currentTimeMillis()
)

data class LocalSyncClientResult(
    val success: Boolean,
    val message: String,
    val pushedSalesCount: Int = 0,
    val pulledProductsCount: Int = 0,
    val pulledBranchesCount: Int = 0,
    val latencyMs: Long = 0L
)

/**
 * Authenticated & AES-256-GCM encrypted LAN P2P Branch Hub Server + Client.
 *
 * Security invariants:
 * - Per-shop 256-bit pairing keys are provisioned from Supabase and wrapped by Android Keystore; no global build-time key is accepted.
 * - UDP discovery beacons are HMAC-signed and timestamped (<=30s clock window) + validated against peer IP.
 * - All /api/sync/push & /api/sync/pull bodies are AES-256-GCM encrypted and authenticated with
 *   mandatory X-BeBoss-Signature, X-BeBoss-Timestamp (<=5 min), and X-BeBoss-Nonce anti-replay protection.
 * - Conflict resolution uses unified ConflictResolutionEngine (HLC + syncVersion + ledger CRDT).
 */
class LocalNetworkSyncServer(
    private val context: Context,
    private val database: AppDatabase
) {
    private val TAG = "LocalSyncServer"
    val port = 8989
    private val discoveryUdpPort = 8990
    private val nsdServiceType = "_beboss._tcp."

    @Volatile
    private var activeShopLanSecretKey: String? = null

    @Volatile
    private var activeShopLanSecretBytes: ByteArray? = null

    private fun sharedLanSecretPreferenceKey(shopSyncKey: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(shopSyncKey.trim().lowercase(Locale.ROOT).toByteArray(StandardCharsets.UTF_8))
        val suffix = digest.joinToString("") { byte -> "%02x".format(byte) }
        return "wrapped_shop_lan_secret_$suffix"
    }

    /**
     * Selects a previously downloaded shop key for offline LAN operation.
     * The encrypted value can only be opened on the Android Keystore installation that saved it.
     */
    @Synchronized
    fun useCachedShopSharedSecret(shopSyncKey: String): Boolean {
        val key = shopSyncKey.trim().lowercase(Locale.ROOT)
        if (key.isBlank()) return false
        if (activeShopLanSecretKey == key && activeShopLanSecretBytes != null) return true
        // Clear any other shop's in-memory key before trying the requested shop. Never
        // allow a shop switch to keep using the previous account's LAN credentials.
        activeShopLanSecretKey = key
        activeShopLanSecretBytes = null
        return try {
            val envelope = context.applicationContext
                .getSharedPreferences("beboss_lan_security", Context.MODE_PRIVATE)
                .getString(sharedLanSecretPreferenceKey(key), null)
                ?: return false
            val secret = CryptoKeyManager.unwrapLanSharedSecret(envelope)
            activeShopLanSecretKey = key
            activeShopLanSecretBytes = secret.toByteArray(StandardCharsets.UTF_8)
            true
        } catch (error: Exception) {
            Log.w(TAG, "Cached shop LAN key unavailable on this terminal: ${error.message}")
            activeShopLanSecretKey = key
            activeShopLanSecretBytes = null
            false
        }
    }

    /** Stores a cloud-issued 256-bit shop key encrypted by the terminal's Android Keystore. */
    @Synchronized
    fun configureShopSharedSecret(shopSyncKey: String, secret: String): Boolean {
        val key = shopSyncKey.trim().lowercase(Locale.ROOT)
        val cleanSecret = secret.trim().lowercase(Locale.ROOT)
        if (key.isBlank() || !cleanSecret.matches(Regex("[a-f0-9]{64}"))) return false
        return try {
            val envelope = CryptoKeyManager.wrapLanSharedSecret(cleanSecret)
            val saved = context.applicationContext
                .getSharedPreferences("beboss_lan_security", Context.MODE_PRIVATE)
                .edit()
                .putString(sharedLanSecretPreferenceKey(key), envelope)
                .commit()
            if (!saved) return false
            activeShopLanSecretKey = key
            activeShopLanSecretBytes = cleanSecret.toByteArray(StandardCharsets.UTF_8)
            true
        } catch (error: Exception) {
            Log.e(TAG, "Could not secure the cloud shop LAN key", error)
            false
        }
    }

    /** Returns the currently selected shop key only to callers inside the app process. */
    @Synchronized
    fun activeShopSharedSecret(): String? {
        val bytes = activeShopLanSecretBytes ?: return null
        val value = String(bytes, StandardCharsets.UTF_8).lowercase(Locale.ROOT)
        return value.takeIf { it.matches(Regex("[a-f0-9]{64}")) }
    }

    private fun getMasterLanSecretBytes(): ByteArray {
        activeShopLanSecretBytes?.let { return it.copyOf() }
        // LAN authentication uses only the shop-scoped key issued by Supabase and
        // wrapped by this installation's Android Keystore. Never fall back to a shared
        // APK/build-time key: every copy of an APK would otherwise share one extractable
        // credential across unrelated shops.
        throw SecurityException("This shop's encrypted LAN pairing key is not synced yet. Connect to cloud once while signed in as the shop owner.")
    }

    private fun getLanHmacKey(): ByteArray =
        CryptoKeyManager.deriveSubkey(getMasterLanSecretBytes(), "BeBoss_LAN_HMAC_v2")

    private fun getLanAesKey(): ByteArray =
        CryptoKeyManager.deriveSubkey(getMasterLanSecretBytes(), "BeBoss_LAN_AES256GCM_v2")

    private val seenNonces = Collections.synchronizedMap(object : LinkedHashMap<String, Long>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>): Boolean {
            return size > 500
        }
    })
    private val concurrentClientsSemaphore = Semaphore(12)

    private var serverSocket: ServerSocket? = null
    private var serverJob: Job? = null
    private var beaconBroadcastJob: Job? = null
    private var discoveryListenJob: Job? = null
    private var udpListenSocket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    private var nsdManager: NsdManager? = null
    private var registrationListener: NsdManager.RegistrationListener? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    private val scope = CoroutineScope(Dispatchers.IO)

    private val _serverStatus = MutableStateFlow(LocalServerStatus.STOPPED)
    val serverStatus: StateFlow<LocalServerStatus> = _serverStatus.asStateFlow()

    private val _serverIpAddress = MutableStateFlow<String?>(null)
    val serverIpAddress: StateFlow<String?> = _serverIpAddress.asStateFlow()

    private val _connectedClientsCount = MutableStateFlow(0)
    val connectedClientsCount: StateFlow<Int> = _connectedClientsCount.asStateFlow()

    private val _lastReceivedPacketSummary = MutableStateFlow<String?>(null)
    val lastReceivedPacketSummary: StateFlow<String?> = _lastReceivedPacketSummary.asStateFlow()

    private val _discoveredHubs = MutableStateFlow<List<DiscoveredBranchHub>>(emptyList())
    val discoveredHubs: StateFlow<List<DiscoveredBranchHub>> = _discoveredHubs.asStateFlow()

    private val _isDiscoveringHubs = MutableStateFlow(false)
    val isDiscoveringHubs: StateFlow<Boolean> = _isDiscoveringHubs.asStateFlow()

    private val _peerSyncEvents = MutableStateFlow<List<BranchPeerSyncEvent>>(emptyList())
    val peerSyncEvents: StateFlow<List<BranchPeerSyncEvent>> = _peerSyncEvents.asStateFlow()

    fun getDeviceLocalIpAddress(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val host = addr.hostAddress
                        if (host != null && !host.startsWith("127.")) {
                            return host
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting IP", e)
        }
        return "127.0.0.1"
    }

    fun startServer(): Boolean {
        if (_serverStatus.value == LocalServerStatus.RUNNING) return true
        _serverStatus.value = LocalServerStatus.STARTING

        return try {
            // Fail closed immediately if LAN sync secret is missing
            getMasterLanSecretBytes()

            val ip = getDeviceLocalIpAddress()
            _serverIpAddress.value = ip
            serverSocket = ServerSocket(port)

            _serverStatus.value = LocalServerStatus.RUNNING
            Log.i(TAG, "Encrypted LAN Hub Server running at $ip:$port")

            serverJob = scope.launch {
                while (_serverStatus.value == LocalServerStatus.RUNNING) {
                    try {
                        val socket = serverSocket?.accept() ?: break
                        launch {
                            concurrentClientsSemaphore.withPermit {
                                handleClientSocket(socket)
                            }
                        }
                    } catch (e: Exception) {
                        if (_serverStatus.value == LocalServerStatus.RUNNING) {
                            Log.e(TAG, "Server socket accept error", e)
                        }
                    }
                }
            }

            startBeaconBroadcaster(ip)
            registerNsdService()
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start local sync server on port $port", e)
            _serverStatus.value = LocalServerStatus.ERROR
            false
        }
    }

    fun stopServer() {
        try {
            _serverStatus.value = LocalServerStatus.STOPPED
            beaconBroadcastJob?.cancel()
            beaconBroadcastJob = null
            serverJob?.cancel()
            serverJob = null
            serverSocket?.close()
            serverSocket = null
            unregisterNsdService()
            _serverIpAddress.value = null
            _connectedClientsCount.value = 0
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping server", e)
        }
    }

    fun startDiscovery() {
        if (_isDiscoveringHubs.value) return
        try {
            getMasterLanSecretBytes()
        } catch (e: Exception) {
            Log.e(TAG, "Discovery aborted: missing LAN sync secret", e)
            return
        }

        _isDiscoveringHubs.value = true
        acquireMulticastLock()

        discoveryListenJob = scope.launch {
            try {
                udpListenSocket = DatagramSocket(discoveryUdpPort).apply {
                    broadcast = true
                    soTimeout = 3000
                }
                val buf = ByteArray(4096)
                val myIp = getDeviceLocalIpAddress()

                while (isActive && _isDiscoveringHubs.value) {
                    try {
                        val packet = DatagramPacket(buf, buf.size)
                        udpListenSocket?.receive(packet)
                        val senderIp = packet.address?.hostAddress.orEmpty()
                        if (senderIp.isNotBlank() && senderIp != myIp && senderIp != "127.0.0.1") {
                            val msg = String(packet.data, 0, packet.length, StandardCharsets.UTF_8)
                            parseBeaconAndAddHub(msg, senderIp)
                        }
                    } catch (_: java.net.SocketTimeoutException) {
                        val cutoff = System.currentTimeMillis() - 20_000L
                        _discoveredHubs.value = _discoveredHubs.value.filter { it.lastSeenAt >= cutoff }
                    } catch (e: Exception) {
                        if (_isDiscoveringHubs.value) Log.w(TAG, "UDP listen: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "UDP discovery bind failed: ${e.message}")
            } finally {
                try { udpListenSocket?.close() } catch (_: Exception) {}
                udpListenSocket = null
            }
        }

        startNsdDiscovery()
    }

    fun stopDiscovery() {
        _isDiscoveringHubs.value = false
        discoveryListenJob?.cancel()
        discoveryListenJob = null
        try { udpListenSocket?.close() } catch (_: Exception) {}
        udpListenSocket = null
        stopNsdDiscovery()
        releaseMulticastLock()
    }

    private fun startBeaconBroadcaster(serverIp: String) {
        beaconBroadcastJob?.cancel()
        beaconBroadcastJob = scope.launch {
            var socket: DatagramSocket? = null
            try {
                socket = DatagramSocket().apply { broadcast = true }
                while (isActive && _serverStatus.value == LocalServerStatus.RUNNING) {
                    try {
                        val profile = database.shopProfileDao().getShopProfileDirect() ?: ShopProfile()
                        val mainBranch = database.branchDao().getMainBranch()
                        val pCount = database.productDao().getProductCountDirect()
                        val sCount = database.saleDao().getSaleCount()
                        val bCount = database.branchDao().getBranchCount()
                        val ts = System.currentTimeMillis()
                        val hubId = "${profile.id}_$serverIp"
                        val sig = computeSignature("$hubId|$serverIp|$port|$ts")

                        val beacon = JSONObject().apply {
                            put("magic", "BEBOSS_HUB_V3")
                            put("id", hubId)
                            put("shopName", profile.shopName)
                            put("branchName", mainBranch?.name ?: "HQ Hub")
                            put("ip", serverIp)
                            put("port", port)
                            put("productsCount", pCount)
                            put("salesCount", sCount)
                            put("branchesCount", bCount)
                            put("ts", ts)
                            put("sig", sig)
                        }.toString().toByteArray(StandardCharsets.UTF_8)

                        val broadcastAddr = InetAddress.getByName("255.255.255.255")
                        socket.send(DatagramPacket(beacon, beacon.size, broadcastAddr, discoveryUdpPort))
                    } catch (e: Exception) {
                        Log.w(TAG, "Beacon send warning: ${e.message}")
                    }
                    delay(3000L)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Beacon broadcaster error: ${e.message}")
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
        }
    }

    private fun parseBeaconAndAddHub(raw: String, senderSocketIp: String) {
        try {
            val obj = JSONObject(raw)
            if (obj.optCleanString("magic") != "BEBOSS_HUB_V3") return
            val id = obj.optCleanString("id")
            val claimedIp = obj.optCleanString("ip").ifBlank { senderSocketIp }
            val claimedPort = obj.optInt("port", -1)
            val ts = obj.optLong("ts", 0L)
            val sig = obj.optCleanString("sig")

            // Enforce source IP match, port range, freshness <=30s, and valid HMAC
            if (claimedIp != senderSocketIp) return
            if (claimedPort !in 1024..65535) return
            if (abs(System.currentTimeMillis() - ts) > 30_000L) return
            val expectedSig = computeSignature("$id|$claimedIp|$claimedPort|$ts")
            if (!constantTimeEquals(sig, expectedSig)) return

            val hub = DiscoveredBranchHub(
                id = id.ifBlank { claimedIp },
                shopName = obj.optCleanString("shopName", "BeBoss Terminal"),
                branchName = obj.optCleanString("branchName", "Master Hub"),
                ipAddress = claimedIp,
                port = claimedPort,
                productsCount = obj.optInt("productsCount", 0),
                salesCount = obj.optInt("salesCount", 0),
                branchesCount = obj.optInt("branchesCount", 1),
                lastSeenAt = System.currentTimeMillis()
            )
            val current = _discoveredHubs.value.filterNot { it.ipAddress == hub.ipAddress }.toMutableList()
            current.add(0, hub)
            _discoveredHubs.value = current
        } catch (_: Exception) {}
    }

    private fun acquireMulticastLock() {
        try {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return
            if (multicastLock == null) {
                multicastLock = wifi.createMulticastLock("BeBossLanDiscovery").apply {
                    setReferenceCounted(false)
                }
            }
            if (multicastLock?.isHeld == false) multicastLock?.acquire()
        } catch (_: Exception) {}
    }

    private fun releaseMulticastLock() {
        try {
            if (multicastLock?.isHeld == true) multicastLock?.release()
        } catch (_: Exception) {}
    }

    private fun registerNsdService() {
        try {
            nsdManager = (context.getSystemService(Context.NSD_SERVICE) as? NsdManager) ?: return
            val info = NsdServiceInfo().apply {
                serviceName = "BeBossBranchHub"
                serviceType = nsdServiceType
                port = this@LocalNetworkSyncServer.port
            }
            val listener = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {}
                override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
                override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {}
                override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
            }
            registrationListener = listener
            nsdManager?.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (_: Exception) {}
    }

    private fun unregisterNsdService() {
        try {
            registrationListener?.let { nsdManager?.unregisterService(it) }
        } catch (_: Exception) {}
        registrationListener = null
    }

    private fun startNsdDiscovery() {
        try {
            if (nsdManager == null) nsdManager = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
            val manager = nsdManager ?: return
            val listener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(regType: String) {}
                override fun onServiceFound(service: NsdServiceInfo) {
                    if (!service.serviceType.contains("_beboss")) return
                    try {
                        @Suppress("DEPRECATION")
                        manager.resolveService(service, object : NsdManager.ResolveListener {
                            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
                            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                                @Suppress("DEPRECATION")
                                val host = serviceInfo.host?.hostAddress ?: return
                                val myIp = getDeviceLocalIpAddress()
                                if (host != myIp && host != "127.0.0.1") {
                                    scope.launch { probeHubInfo(host, serviceInfo.port) }
                                }
                            }
                        })
                    } catch (_: Exception) {}
                }
                override fun onServiceLost(service: NsdServiceInfo) {}
                override fun onDiscoveryStopped(serviceType: String) {}
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            }
            discoveryListener = listener
            manager.discoverServices(nsdServiceType, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (_: Exception) {}
    }

    private fun stopNsdDiscovery() {
        try {
            discoveryListener?.let { nsdManager?.stopServiceDiscovery(it) }
        } catch (_: Exception) {}
        discoveryListener = null
    }

    suspend fun probeHubInfo(ip: String, targetPort: Int = port) = withContext(Dispatchers.IO) {
        try {
            val nonce = UUID.randomUUID().toString()
            val ts = System.currentTimeMillis().toString()
            val sig = computeSignature("GET|/api/info|$ts|$nonce|")
            val resp = sendRawHttpRequest(
                host = ip,
                targetPort = targetPort,
                method = "GET",
                path = "/api/info",
                headers = mapOf(
                    "X-BeBoss-Timestamp" to ts,
                    "X-BeBoss-Nonce" to nonce,
                    "X-BeBoss-Signature" to sig
                )
            )
            if (resp.statusCode in 200..299) {
                val obj = JSONObject(resp.body)
                val hub = DiscoveredBranchHub(
                    id = "${obj.optCleanString("hubId")}_$ip",
                    shopName = obj.optCleanString("hubName", "BeBoss Terminal"),
                    branchName = obj.optCleanString("branchName", "Master Hub"),
                    ipAddress = ip,
                    port = targetPort,
                    productsCount = obj.optInt("productsCount", 0),
                    salesCount = obj.optInt("salesCount", 0),
                    branchesCount = obj.optInt("branchesCount", 1),
                    lastSeenAt = System.currentTimeMillis()
                )
                val current = _discoveredHubs.value.filterNot { it.ipAddress == ip }.toMutableList()
                current.add(0, hub)
                _discoveredHubs.value = current
            }
        } catch (_: Exception) {}
    }

    private suspend fun handleClientSocket(socket: Socket) = withContext(Dispatchers.IO) {
        _connectedClientsCount.value = (_connectedClientsCount.value + 1).coerceAtLeast(1)
        val remoteIp = socket.inetAddress?.hostAddress ?: "Peer"
        try {
            socket.soTimeout = 10_000
            val input = BufferedInputStream(socket.getInputStream())
            val out = socket.getOutputStream()
            val request = try {
                readLanHttpRequestHead(input)
            } catch (error: Exception) {
                sendJsonResponse(out, 400, JSONObject().put("error", error.message ?: "Invalid HTTP request").toString())
                return@withContext
            }

            if (request.contentLength > SyncPayloadValidator.MAX_RAW_PAYLOAD_BYTES) {
                sendJsonResponse(out, 413, """{"error":"Payload size out of safe bounds"}""")
                return@withContext
            }
            val method = request.method
            val path = request.path
            val receivedSig = request.headers["x-beboss-signature"].orEmpty()
            val receivedTs = request.headers["x-beboss-timestamp"].orEmpty()
            val receivedNonce = request.headers["x-beboss-nonce"].orEmpty()
            val body = try {
                readLanHttpRequestBody(input, request.contentLength, SyncPayloadValidator.MAX_RAW_PAYLOAD_BYTES)
            } catch (error: Exception) {
                sendJsonResponse(out, 400, JSONObject().put("error", error.message ?: "Invalid HTTP body").toString())
                return@withContext
            }

            // Mandatory HMAC + Timestamp + Anti-Replay Nonce verification on ALL endpoints
            if (!verifyIncomingHeaders(method, path, receivedTs, receivedNonce, receivedSig, body)) {
                sendJsonResponse(out, 403, """{"error":"Unauthorized or replayed LAN sync request"}""")
                return@withContext
            }

            when {
                path == "/api/info" && method == "GET" -> {
                    val profile = database.shopProfileDao().getShopProfileDirect() ?: ShopProfile()
                    val mainBranch = database.branchDao().getMainBranch()
                    val productsCount = database.productDao().getAllProductsList().size
                    val salesCount = database.saleDao().getAllSalesList().size
                    val branchesCount = database.branchDao().getAllActiveBranchesList().size

                    val json = JSONObject().apply {
                        put("status", "ONLINE")
                        put("hubName", profile.shopName)
                        put("branchName", mainBranch?.name ?: "HQ Hub")
                        put("hubId", profile.id)
                        put("currency", profile.currencyCode)
                        put("productsCount", productsCount)
                        put("salesCount", salesCount)
                        put("branchesCount", branchesCount)
                        put("timestamp", System.currentTimeMillis())
                    }
                    sendSignedJsonResponse(out, 200, json.toString())
                }

                path == "/api/sync/pull" && method == "GET" -> {
                    val fullPackage = buildFullMeshPackage(null).toString()
                    val encryptedEnvelope = encryptLanBody(fullPackage, receivedTs, receivedNonce)
                    sendSignedJsonResponse(out, 200, encryptedEnvelope)
                }

                path == "/api/sync/push" && method == "POST" -> {
                    if (body.isBlank()) {
                        sendJsonResponse(out, 400, """{"error":"Empty request body"}""")
                        return@withContext
                    }
                    val decryptedJson = decryptLanBody(body, receivedTs, receivedNonce)
                    val parsed = ShopDataTransferManager.parseShopPackageString(decryptedJson, enforceReplayProtection = true)
                    val mergeResult = ConflictResolutionEngine.mergePackage(database, parsed, "P2P_LAN:$remoteIp")

                    val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                    val summaryMsg = "Merged ${mergeResult.totalMergedCount} items (${parsed.sales.size} sales, ${parsed.products.size} products) from ${parsed.exportedBy}"
                    _lastReceivedPacketSummary.value = "$summaryMsg ($time)"
                    val currentEvents = _peerSyncEvents.value.toMutableList()
                    currentEvents.add(0, BranchPeerSyncEvent(peerName = parsed.exportedBy, peerIp = remoteIp, summary = summaryMsg))
                    _peerSyncEvents.value = currentEvents.take(25)

                    val resp = JSONObject().apply {
                        put("success", true)
                        put("message", summaryMsg)
                        put("mergedCount", mergeResult.totalMergedCount)
                        put("conflictsResolved", mergeResult.conflictsResolved)
                        put("receivedAt", System.currentTimeMillis())
                    }
                    sendSignedJsonResponse(out, 200, resp.toString())
                }

                else -> {
                    sendJsonResponse(out, 404, """{"error":"Not Found"}""")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Client socket handler error", e)
        } finally {
            try { socket.close() } catch (_: Exception) {}
            _connectedClientsCount.value = (_connectedClientsCount.value - 1).coerceAtLeast(0)
        }
    }

    private fun verifyIncomingHeaders(
        method: String,
        path: String,
        tsStr: String,
        nonce: String,
        sig: String,
        body: String
    ): Boolean {
        val ts = tsStr.toLongOrNull() ?: return false
        val now = System.currentTimeMillis()
        if (abs(now - ts) > 300_000L) return false // 5-minute clock skew ceiling
        if (nonce.length < 8) return false

        synchronized(seenNonces) {
            if (seenNonces.containsKey(nonce)) return false
            seenNonces[nonce] = now
        }

        val expected = computeSignature("$method|$path|$tsStr|$nonce|$body")
        return constantTimeEquals(sig, expected)
    }

    private fun encryptLanBody(plain: String, ts: String, nonce: String): String {
        val aad = "$ts|$nonce".toByteArray(StandardCharsets.UTF_8)
        val encrypted = CryptoKeyManager.encryptAesGcm(getLanAesKey(), plain.toByteArray(StandardCharsets.UTF_8), aad)
        return JSONObject().apply {
            put("enc", encrypted)
            put("ts", ts)
            put("nonce", nonce)
        }.toString()
    }

    private fun decryptLanBody(body: String, expectedTs: String, expectedNonce: String): String {
        val obj = JSONObject(body)
        val enc = obj.optCleanString("enc")
        require(enc.isNotBlank()) { "LAN sync requires encrypted AES-GCM envelope." }
        val aad = "$expectedTs|$expectedNonce".toByteArray(StandardCharsets.UTF_8)
        val plainBytes = CryptoKeyManager.decryptAesGcm(getLanAesKey(), enc, aad)
        return String(plainBytes, StandardCharsets.UTF_8)
    }

    private suspend fun buildFullMeshPackage(currentUser: User?): JSONObject {
        val profile = database.shopProfileDao().getShopProfileDirect() ?: ShopProfile()
        return ShopDataTransferManager.createExportJson(
            profile = profile,
            users = database.userDao().getAllActiveUsersList(),
            products = database.productDao().getAllProductsList(),
            customers = database.customerDao().getAllCustomersList(),
            sales = database.saleDao().getAllSalesList(),
            saleItems = database.saleDao().getAllSaleItemsList(),
            payments = database.customerPaymentDao().getAllPaymentsList(),
            exportedByUser = currentUser,
            branches = database.branchDao().getAllActiveBranchesList(),
            stockTransfers = database.stockTransferDao().getAllTransfersList(),
            purchases = database.purchaseDao().getAllPurchasesList(),
            tombstones = database.syncTombstoneDao().getAllTombstonesList()
        )
    }

    private fun sendSignedJsonResponse(out: OutputStream, statusCode: Int, body: String) {
        val sig = computeSignature(body)
        sendJsonResponse(out, statusCode, body, sig)
    }

    private fun sendJsonResponse(out: OutputStream, statusCode: Int, body: String, signature: String? = null) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val sigHeader = if (!signature.isNullOrBlank()) "X-BeBoss-Signature: $signature\r\n" else ""
        val statusPhrase = when (statusCode) {
            200 -> "OK"
            400 -> "Bad Request"
            403 -> "Forbidden"
            404 -> "Not Found"
            413 -> "Payload Too Large"
            else -> "Error"
        }
        val header = "HTTP/1.1 $statusCode $statusPhrase\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n" +
            "Content-Length: ${bytes.size}\r\n" +
            sigHeader +
            "Connection: close\r\n\r\n"
        out.write(header.toByteArray(Charsets.UTF_8))
        out.write(bytes)
        out.flush()
    }

    suspend fun syncWithMasterHub(hubIp: String, currentUser: User?): LocalSyncClientResult = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        try {
            val cleanIp = hubIp.trim().removePrefix("http://").removePrefix("https://").substringBefore(":")

            // 1. Push encrypted & authenticated local dataset over bounded raw Socket (never requires usesCleartextTraffic)
            val unsyncedSales = database.saleDao().getUnsyncedSales()
            val allSales = database.saleDao().getAllSalesList()
            val plainJson = buildFullMeshPackage(currentUser).toString()

            val pushTs = System.currentTimeMillis().toString()
            val pushNonce = UUID.randomUUID().toString()
            val encryptedBody = encryptLanBody(plainJson, pushTs, pushNonce)
            val pushSig = computeSignature("POST|/api/sync/push|$pushTs|$pushNonce|$encryptedBody")

            val pushResp = sendRawHttpRequest(
                host = cleanIp,
                targetPort = port,
                method = "POST",
                path = "/api/sync/push",
                headers = mapOf(
                    "Content-Type" to "application/json; charset=UTF-8",
                    "X-BeBoss-Timestamp" to pushTs,
                    "X-BeBoss-Nonce" to pushNonce,
                    "X-BeBoss-Signature" to pushSig
                ),
                body = encryptedBody
            )
            if (pushResp.statusCode !in 200..299) {
                throw IllegalStateException("Peer hub rejected push (HTTP ${pushResp.statusCode})")
            }

            val now = System.currentTimeMillis()
            for (s in unsyncedSales) {
                database.saleDao().markSaleSynced(s.id, now)
            }

            // 2. Pull encrypted branch state from Master Hub
            val pullTs = System.currentTimeMillis().toString()
            val pullNonce = UUID.randomUUID().toString()
            val pullSig = computeSignature("GET|/api/sync/pull|$pullTs|$pullNonce|")

            val pullResp = sendRawHttpRequest(
                host = cleanIp,
                targetPort = port,
                method = "GET",
                path = "/api/sync/pull",
                headers = mapOf(
                    "X-BeBoss-Timestamp" to pullTs,
                    "X-BeBoss-Nonce" to pullNonce,
                    "X-BeBoss-Signature" to pullSig
                )
            )

            var pulledProductsCount = 0
            var pulledBranchesCount = 0
            if (pullResp.statusCode in 200..299) {
                val respText = pullResp.body
                val respSig = pullResp.headers["x-beboss-signature"].orEmpty()
                if (!constantTimeEquals(respSig, computeSignature(respText))) {
                    throw SecurityException("Peer response HMAC signature check failed.")
                }
                val decrypted = decryptLanBody(respText, pullTs, pullNonce)
                val summary = ShopDataTransferManager.parseShopPackageString(decrypted, enforceReplayProtection = true)
                ConflictResolutionEngine.mergePackage(database, summary, "P2P_PULL:$cleanIp")
                pulledProductsCount = summary.products.size
                pulledBranchesCount = summary.branches.size
            } else {
                throw IllegalStateException("Peer hub rejected pull (HTTP ${pullResp.statusCode})")
            }

            val latency = System.currentTimeMillis() - startTime
            LocalSyncClientResult(
                success = true,
                message = "Encrypted LAN Mesh Sync succeeded with $cleanIp ($pulledBranchesCount branches, $pulledProductsCount products)",
                pushedSalesCount = allSales.size,
                pulledProductsCount = pulledProductsCount,
                pulledBranchesCount = pulledBranchesCount,
                latencyMs = latency
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val latency = System.currentTimeMillis() - startTime
            Log.e(TAG, "P2P WiFi Sync Error", e)
            LocalSyncClientResult(
                success = false,
                message = "LAN sync failed ($hubIp): ${e.safeMessage("Connection error")}",
                latencyMs = latency
            )
        }
    }

    private data class RawHttpResponse(
        val statusCode: Int,
        val headers: Map<String, String>,
        val body: String
    )

    private fun sendRawHttpRequest(
        host: String,
        targetPort: Int,
        method: String,
        path: String,
        headers: Map<String, String>,
        body: String = ""
    ): RawHttpResponse {
        val bodyBytes = body.toByteArray(StandardCharsets.UTF_8)
        Socket().use { socket ->
            socket.connect(InetSocketAddress(host, targetPort), 4000)
            socket.soTimeout = 10_000
            val out = socket.getOutputStream()
            val reqBuilder = StringBuilder()
                .append("$method $path HTTP/1.1\r\n")
                .append("Host: $host:$targetPort\r\n")
            headers.forEach { (k, v) -> reqBuilder.append("$k: $v\r\n") }
            if (bodyBytes.isNotEmpty() || method == "POST") {
                reqBuilder.append("Content-Length: ${bodyBytes.size}\r\n")
            }
            reqBuilder.append("Connection: close\r\n\r\n")
            out.write(reqBuilder.toString().toByteArray(StandardCharsets.UTF_8))
            if (bodyBytes.isNotEmpty()) {
                out.write(bodyBytes)
            }
            out.flush()

            val bis = BufferedInputStream(socket.getInputStream())
            val rawOut = ByteArrayOutputStream()
            val buf = ByteArray(8192)
            var total = 0
            while (true) {
                val r = bis.read(buf)
                if (r <= 0) break
                total += r
                require(total <= SyncPayloadValidator.MAX_RAW_PAYLOAD_BYTES + 16_384) {
                    "LAN response exceeded maximum safe size."
                }
                rawOut.write(buf, 0, r)
            }
            val rawStr = rawOut.toString(StandardCharsets.UTF_8.name())
            val sep = rawStr.indexOf("\r\n\r\n")
            val head = if (sep >= 0) rawStr.substring(0, sep) else rawStr
            val respBody = if (sep >= 0) rawStr.substring(sep + 4) else ""
            val lines = head.split("\r\n")
            val statusCode = lines.firstOrNull()?.split(" ")?.getOrNull(1)?.toIntOrNull() ?: 500
            val respHeaders = mutableMapOf<String, String>()
            for (i in 1 until lines.size) {
                val idx = lines[i].indexOf(':')
                if (idx > 0) {
                    val k = lines[i].substring(0, idx).trim().lowercase(Locale.ROOT)
                    val v = lines[i].substring(idx + 1).trim()
                    respHeaders[k] = v
                }
            }
            return RawHttpResponse(statusCode = statusCode, headers = respHeaders, body = respBody)
        }
    }

    private fun computeSignature(data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(getLanHmacKey(), "HmacSHA256"))
        return SecurityUtils.bytesToHex(mac.doFinal(data.toByteArray(StandardCharsets.UTF_8))).take(32)
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        return SecurityUtils.constantTimeEquals(a, b)
    }
}
