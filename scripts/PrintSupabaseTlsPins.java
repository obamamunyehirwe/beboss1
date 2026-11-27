import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SNIHostName;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Prints real OkHttp CertificatePinner SPKI pins for the HTTPS host in root .env.
 * Uses the JVM's standard PKI validation and HTTPS hostname verification; it
 * deliberately fails closed on untrusted, expired, or hostname-mismatched TLS.
 *
 * Run from the repository root with Java 11+:
 *   java .\\scripts\\PrintSupabaseTlsPins.java --update-env
 */
public final class PrintSupabaseTlsPins {
    private static final Path ENV_FILE = Paths.get(".env");
    private static final Pattern URL_LINE =
        Pattern.compile("^\\s*SUPABASE_URL\\s*=\\s*(.*?)\\s*$");
    private static final Pattern PIN_LINE =
        Pattern.compile("^\\s*SUPABASE_CERT_PINS\\s*=.*$");

    private PrintSupabaseTlsPins() {}

    public static void main(String[] args) {
        try {
            boolean updateEnv = false;
            for (String arg : args) {
                if ("--update-env".equals(arg)) {
                    updateEnv = true;
                } else {
                    throw new IllegalArgumentException("Unknown argument: " + arg);
                }
            }

            List<String> envLines = Files.exists(ENV_FILE)
                ? Files.readAllLines(ENV_FILE, StandardCharsets.UTF_8)
                : new ArrayList<>();
            String configuredUrl = firstNonBlank(
                System.getenv("SUPABASE_URL"),
                readEnvValue(envLines, "SUPABASE_URL")
            );
            if (configuredUrl == null) {
                throw new IllegalStateException(
                    "SUPABASE_URL is missing. Set the exact project HTTPS URL in the ignored root .env."
                );
            }

            URI endpoint = URI.create(stripQuotes(configuredUrl));
            if (!"https".equalsIgnoreCase(endpoint.getScheme())
                || endpoint.getHost() == null
                || endpoint.getUserInfo() != null
                || endpoint.getQuery() != null
                || endpoint.getFragment() != null) {
                throw new IllegalArgumentException(
                    "SUPABASE_URL must be an HTTPS URL with a DNS hostname and no embedded credentials, query, or fragment."
                );
            }
            int port = endpoint.getPort() < 0 ? 443 : endpoint.getPort();
            if (port != 443) {
                throw new IllegalArgumentException("Supabase API TLS pin discovery expects the standard HTTPS port 443.");
            }
            String host = endpoint.getHost();

            String pinCsv = discoverPins(host, port);
            System.out.println("Verified Supabase TLS host: " + host);
            System.out.println("SUPABASE_CERT_PINS=" + pinCsv);

            if (updateEnv) {
                writePins(envLines, pinCsv);
                System.out.println("Updated only SUPABASE_CERT_PINS in " + ENV_FILE.toAbsolutePath());
            }
        } catch (Exception error) {
            System.err.println("Could not generate a real Supabase TLS pin: " + error.getMessage());
            System.err.println("No value was written. Check SUPABASE_URL, network connectivity, system time, and JVM CA trust.");
            System.exit(1);
        }
    }

    private static String discoverPins(String host, int port) throws Exception {
        try (SSLSocket socket = (SSLSocket) SSLContext.getDefault()
                .getSocketFactory().createSocket()) {
            socket.connect(new InetSocketAddress(host, port), 15_000);
            socket.setSoTimeout(15_000);

            SSLParameters parameters = socket.getSSLParameters();
            parameters.setEndpointIdentificationAlgorithm("HTTPS");
            parameters.setServerNames(List.of(new SNIHostName(host)));
            socket.setSSLParameters(parameters);
            socket.startHandshake();

            Certificate[] peerChain = socket.getSession().getPeerCertificates();
            Set<String> pins = new LinkedHashSet<>();
            for (int index = 0; index < peerChain.length; index++) {
                if (!(peerChain[index] instanceof X509Certificate)) {
                    continue;
                }
                X509Certificate certificate = (X509Certificate) peerChain[index];
                // A self-signed trust anchor is not normally sent by the server
                // and is intentionally not pinned as a peer-chain certificate.
                if (index == peerChain.length - 1
                    && certificate.getSubjectX500Principal().equals(certificate.getIssuerX500Principal())) {
                    continue;
                }
                byte[] subjectPublicKeyInfo = certificate.getPublicKey().getEncoded();
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(subjectPublicKeyInfo);
                pins.add("sha256/" + Base64.getEncoder().encodeToString(digest));
            }
            if (pins.isEmpty()) {
                throw new IOException("The verified TLS peer did not provide an X.509 certificate chain.");
            }
            return String.join(",", pins);
        }
    }

    private static String readEnvValue(List<String> lines, String key) {
        Pattern pattern = Pattern.compile("^\\s*" + Pattern.quote(key) + "\\s*=\\s*(.*?)\\s*$");
        String found = null;
        for (String line : lines) {
            Matcher matcher = pattern.matcher(line);
            if (matcher.matches()) {
                found = matcher.group(1);
            }
        }
        return found == null || found.isBlank() ? null : stripQuotes(found);
    }

    private static String stripQuotes(String value) {
        String trimmed = value.trim();
        if (trimmed.length() >= 2
            && ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
                || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
            return trimmed.substring(1, trimmed.length() - 1).trim();
        }
        return trimmed;
    }

    private static String firstNonBlank(String preferred, String fallback) {
        return preferred != null && !preferred.isBlank() ? preferred : fallback;
    }

    private static void writePins(List<String> originalLines, String pinCsv) throws IOException {
        List<String> updated = new ArrayList<>();
        boolean written = false;
        for (String line : originalLines) {
            if (PIN_LINE.matcher(line).matches()) {
                if (!written) {
                    updated.add("SUPABASE_CERT_PINS=" + pinCsv);
                    written = true;
                }
            } else {
                updated.add(line);
            }
        }
        if (!written) {
            if (!updated.isEmpty() && !updated.get(updated.size() - 1).isBlank()) {
                updated.add("");
            }
            updated.add("SUPABASE_CERT_PINS=" + pinCsv);
        }
        Files.write(ENV_FILE, updated, StandardCharsets.UTF_8);
    }
}
