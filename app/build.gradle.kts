import java.util.Properties
import java.security.KeyStore
import java.security.MessageDigest
import java.net.URI
import java.util.Base64

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.roborazzi)
}


// Configuration-cache-safe signing gates. These tasks receive booleans only:
// no signing secret, password, key bytes, or Gradle script object is serialized
// into the task action or Gradle configuration cache.
abstract class ValidateCredentialPepperTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Input
  abstract val hasValidPepper: org.gradle.api.provider.Property<Boolean>

  @org.gradle.api.tasks.TaskAction
  fun validate() {
    if (!hasValidPepper.get()) {
      throw org.gradle.api.GradleException(
        "The one-time Android transition release requires the existing credential pepper so it can move legacy offline PIN/password verification into Android Keystore. Never use this setting for the final secure release."
      )
    }
  }
}

abstract class ValidateSecureMigrationApprovalTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Input
  abstract val approved: org.gradle.api.provider.Property<Boolean>

  @get:org.gradle.api.tasks.Input
  abstract val firstProductionRelease: org.gradle.api.provider.Property<Boolean>

  @get:org.gradle.api.tasks.Input
  abstract val secureUpdatesApproved: org.gradle.api.provider.Property<Boolean>

  @org.gradle.api.tasks.TaskAction
  fun validate() {
    val approvalCount = listOf(
      approved.get(),
      firstProductionRelease.get(),
      secureUpdatesApproved.get()
    ).count { it }
    if (approvalCount != 1) {
      throw org.gradle.api.GradleException(
        "Secure Android release requires exactly one approval: SECURE_CREDENTIAL_MIGRATION_APPROVED=true after every legacy terminal has migrated, ANDROID_FIRST_PRODUCTION_RELEASE=true only for the first customer release with no existing production installs or legacy backups, or ANDROID_SECURE_UPDATES_APPROVED=true for later releases of an already-secure production install base."
      )
    }
  }
}

abstract class ValidateAndroidCloudConfigurationTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Input
  abstract val hasValidHttpsUrl: org.gradle.api.provider.Property<Boolean>

  @get:org.gradle.api.tasks.Input
  abstract val hasPublicApiKey: org.gradle.api.provider.Property<Boolean>

  @get:org.gradle.api.tasks.Input
  abstract val hasValidCertificatePin: org.gradle.api.provider.Property<Boolean>

  @org.gradle.api.tasks.TaskAction
  fun validate() {
    if (!hasValidHttpsUrl.get()) {
      throw org.gradle.api.GradleException(
        "Android release cloud configuration is incomplete. Set SUPABASE_URL to the HTTPS URL of the BeBoss Supabase project in the ignored root .env file."
      )
    }
    if (!hasPublicApiKey.get()) {
      throw org.gradle.api.GradleException(
        "Android release requires a public Supabase API key. Set SUPABASE_PUBLISHABLE_KEY (sb_publishable_...) or a legacy SUPABASE_ANON_KEY with JWT role anon. Never use SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in the Android app."
      )
    }
    if (!hasValidCertificatePin.get()) {
      throw org.gradle.api.GradleException(
        "Android release TLS pinning is mandatory. Set SUPABASE_CERT_PINS to the real sha256/<base64 SHA-256 SubjectPublicKeyInfo> pins generated from the verified Supabase TLS certificate chain."
      )
    }
  }
}

abstract class ValidateSentryDsnTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Input
  abstract val hasValidDsn: org.gradle.api.provider.Property<Boolean>

  @org.gradle.api.tasks.TaskAction
  fun validate() {
    if (!hasValidDsn.get()) {
      throw org.gradle.api.GradleException(
        "Production crash reporting is not configured. Add the public SENTRY_DSN to the ignored root .env file and GitHub Actions secret SENTRY_DSN before building a customer release."
      )
    }
  }
}
abstract class ValidateReleaseSigningTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Input
  abstract val hasKeystore: org.gradle.api.provider.Property<Boolean>

  @get:org.gradle.api.tasks.Input
  abstract val hasCredentials: org.gradle.api.provider.Property<Boolean>

  @get:org.gradle.api.tasks.Input
  abstract val hasVerifiedCertificate: org.gradle.api.provider.Property<Boolean>

  @org.gradle.api.tasks.TaskAction
  fun validate() {
    if (!hasKeystore.get() || !hasCredentials.get()) {
      throw org.gradle.api.GradleException(
        "Release signing is not configured. Set KEYSTORE_PATH, STORE_PASSWORD, KEY_PASSWORD and KEY_ALIAS in the ignored root .env file or protected CI secrets. A debug keystore is never accepted for release builds."
      )
    }
    if (!hasVerifiedCertificate.get()) {
      throw org.gradle.api.GradleException(
        "The configured Android release keystore does not match ANDROID_RELEASE_CERT_SHA256 (or the legacy ANDROID_UPLOAD_CERT_SHA256 alias). Set the fingerprint of the owner-managed APK signing certificate. Google Play services or keys are not required for direct APK distribution."
      )
    }
  }
}

// Real signing material is read from the developer's ignored root .env file or
// protected CI environment. Example files never contain production key material.
val releaseSigningEnv = Properties().apply {
  val envFile = rootProject.file(".env")
  if (envFile.isFile) envFile.inputStream().use { load(it) }
}
fun signingSecret(name: String): String? =
  providers.environmentVariable(name).orNull?.takeIf { it.isNotBlank() }
    ?: (findProperty(name) as? String)?.takeIf { it.isNotBlank() }
    ?: releaseSigningEnv.getProperty(name)?.takeIf { it.isNotBlank() }?.trim()?.removeSurrounding("\"")?.removeSurrounding("'")
val releaseKeystorePath = signingSecret("KEYSTORE_PATH")
val releaseKeystoreFile = releaseKeystorePath?.let { rootProject.file(it) }
val releaseStorePassword = signingSecret("STORE_PASSWORD")
val releaseKeyPassword = signingSecret("KEY_PASSWORD")
val releaseKeyAlias = signingSecret("KEY_ALIAS")
val expectedReleaseCertificateSha256 = (
  signingSecret("ANDROID_RELEASE_CERT_SHA256")
    ?: signingSecret("ANDROID_UPLOAD_CERT_SHA256")
  ).orEmpty().filter { it.isLetterOrDigit() }.uppercase()

fun actualReleaseCertificateSha256(): String? {
  val file = releaseKeystoreFile ?: return null
  val password = releaseStorePassword ?: return null
  val alias = releaseKeyAlias ?: return null
  if (!file.isFile) return null
  return runCatching {
    val store = sequenceOf("PKCS12", "JKS").mapNotNull { type ->
      runCatching {
        KeyStore.getInstance(type).apply {
          file.inputStream().use { load(it, password.toCharArray()) }
        }
      }.getOrNull()
    }.firstOrNull() ?: return null
    val certificate = store.getCertificate(alias) ?: return null
    MessageDigest.getInstance("SHA-256")
      .digest(certificate.encoded)
      .joinToString("") { "%02X".format(it) }
  }.getOrNull()
}
val configuredReleaseCertificateMatches =
  expectedReleaseCertificateSha256.matches(Regex("[A-F0-9]{64}")) &&
    actualReleaseCertificateSha256() == expectedReleaseCertificateSha256

android {
  namespace = "com.beboss.shopmgmt"
  compileSdk = 36
  flavorDimensions += "credentialCompatibility"

  defaultConfig {
    applicationId = "com.beboss.shopmgmt"
    minSdk = 24
    targetSdk = 36
    // First direct-production secure build; no legacy migration install base is assumed.
    versionCode = 20
    versionName = "2.6.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  signingConfigs {
    create("release") {
      // Never sign a production variant with the public Android debug certificate.
      // Leave the config unset unless the protected CI/local release credentials exist;
      // validateReleaseSigningConfiguration below provides the actionable failure.
      if (
        releaseKeystoreFile?.isFile == true &&
        !releaseStorePassword.isNullOrBlank() &&
        !releaseKeyPassword.isNullOrBlank() &&
        !releaseKeyAlias.isNullOrBlank()
      ) {
        storeFile = releaseKeystoreFile
        storePassword = releaseStorePassword
        keyAlias = releaseKeyAlias
        keyPassword = releaseKeyPassword
      }
    }
    create("debugConfig") {
      val rootKeystore = file("${rootDir}/debug.keystore")
      val userKeystore = file("${System.getProperty("user.home")}/.android/debug.keystore")
      storeFile = if (rootKeystore.exists()) rootKeystore else userKeystore
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  val defaultEnvProps = Properties().apply {
    val exampleFile = rootProject.file(".env.example")
    if (exampleFile.exists()) {
      exampleFile.inputStream().use { load(it) }
    }
  }
  fun envConfigString(key: String): String {
    // Resolve certificate fingerprints with the same compatibility alias as
    // the release-signing gate. Otherwise the build could validate the legacy
    // upload fingerprint but embed the example fingerprint into the APK.
    val configuredSecret = when (key) {
      "ANDROID_RELEASE_CERT_SHA256" ->
        signingSecret(key) ?: signingSecret("ANDROID_UPLOAD_CERT_SHA256")
      else -> signingSecret(key)
    }
    // Explicit environment/Gradle overrides win, then ignored root .env,
    // and .env.example is only a final fallback.
    val raw = (
      configuredSecret
        ?: defaultEnvProps.getProperty(key)?.takeIf { it.isNotBlank() }
        ?: ""
      ).trim()
    val unquoted = raw.removeSurrounding("\"")
    val escaped = unquoted.replace("\\", "\\\\").replace("\"", "\\\"")
    return "\"$escaped\""
  }

  productFlavors {
    create("transition") {
      dimension = "credentialCompatibility"
      versionCode = 18
      versionName = "2.4.1"
      // One-time migration release: move the old pepper into Android Keystore at first launch.
      // This constant exists in Transition only; Secure intentionally has no such field.
      buildConfigField("String", "BEBOSS_SECURITY_PEPPER", envConfigString("BEBOSS_SECURITY_PEPPER"))
    }
    create("secure") {
      dimension = "credentialCompatibility"
      versionCode = 20
      versionName = "2.6.0"
      // No global DataShare HMAC or credential pepper is packaged in the final secure APK.
    }
  }
  buildTypes {
    release {
      isCrunchPngs = true
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig = signingConfigs.getByName("release")
      buildConfigField("String", "BEBOSS_ADMIN_URL", envConfigString("BEBOSS_ADMIN_URL"))
      buildConfigField("String", "BEBOSS_ADMIN_WHATSAPP", envConfigString("BEBOSS_ADMIN_WHATSAPP"))
      buildConfigField("String", "SENTRY_DSN", envConfigString("SENTRY_DSN"))
      buildConfigField("String", "ANDROID_RELEASE_CERT_SHA256", envConfigString("ANDROID_RELEASE_CERT_SHA256"))
      buildConfigField("String", "SUPABASE_ANON_KEY", envConfigString("SUPABASE_ANON_KEY"))
      buildConfigField("String", "SUPABASE_CERT_PINS", envConfigString("SUPABASE_CERT_PINS"))
      buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", envConfigString("SUPABASE_PUBLISHABLE_KEY"))
      buildConfigField("String", "SUPABASE_URL", envConfigString("SUPABASE_URL"))
    }
    debug { 
      signingConfig = signingConfigs.getByName("debugConfig") 
      buildConfigField("String", "BEBOSS_ADMIN_URL", envConfigString("BEBOSS_ADMIN_URL"))
      buildConfigField("String", "BEBOSS_ADMIN_WHATSAPP", envConfigString("BEBOSS_ADMIN_WHATSAPP"))
      buildConfigField("String", "SENTRY_DSN", envConfigString("SENTRY_DSN"))
      buildConfigField("String", "ANDROID_RELEASE_CERT_SHA256", envConfigString("ANDROID_RELEASE_CERT_SHA256"))
      buildConfigField("String", "SUPABASE_ANON_KEY", envConfigString("SUPABASE_ANON_KEY"))
      buildConfigField("String", "SUPABASE_CERT_PINS", envConfigString("SUPABASE_CERT_PINS"))
      buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", envConfigString("SUPABASE_PUBLISHABLE_KEY"))
      buildConfigField("String", "SUPABASE_URL", envConfigString("SUPABASE_URL"))
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions {
    unitTests {
      isIncludeAndroidResources = true
      // Robolectric downloads large Android framework jars at test runtime.
      // Maven Central may rate-limit parallel CI downloads; use Google's
      // mirror of Maven Central to avoid flaky HTTP 429 failures.
      all {
        it.systemProperty(
          "robolectric.dependency.repo.url",
          "https://maven-central.storage-download.googleapis.com/maven2/"
        )
        it.systemProperty("robolectric.dependency.repo.id", "google-maven-central")
      }
    }
  }
  sourceSets {
    getByName("test").assets.directories.add("$projectDir/schemas")
  }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

ksp {
  arg("room.schemaLocation", "$projectDir/schemas")
  arg("room.incremental", "true")
}


// The project-wide DataShare HMAC stays server-side. Android signs new shares with
// each registered shop random key protected by the platform Keystore.
val configuredSupabaseUrl = signingSecret("SUPABASE_URL").orEmpty()
val configuredSupabasePublishableKey = signingSecret("SUPABASE_PUBLISHABLE_KEY").orEmpty()
val configuredSupabaseLegacyAnonKey = signingSecret("SUPABASE_ANON_KEY").orEmpty()
val configuredSupabasePins = signingSecret("SUPABASE_CERT_PINS").orEmpty()

val hasValidSupabaseHttpsUrl = runCatching {
  val uri = URI(configuredSupabaseUrl)
  uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank() && uri.userInfo == null
}.getOrDefault(false)

val hasPublicSupabaseApiKey =
  configuredSupabasePublishableKey.startsWith("sb_publishable_") ||
    runCatching {
      val segments = configuredSupabaseLegacyAnonKey.split(".")
      if (segments.size != 3 || !segments[0].startsWith("eyJ")) {
        false
      } else {
        val payload = String(Base64.getUrlDecoder().decode(segments[1]), Charsets.UTF_8)
        Regex("\"role\"\\s*:\\s*\"anon\"").containsMatchIn(payload)
      }
    }.getOrDefault(false)

val configuredSupabasePinEntries = configuredSupabasePins.split(",").map { it.trim() }
val supabasePinPattern = Regex("sha256/[A-Za-z0-9+/]{43}=")
val hasValidSupabaseCertificatePin =
  configuredSupabasePinEntries.isNotEmpty() &&
    configuredSupabasePinEntries.all { it.isNotBlank() && supabasePinPattern.matches(it) } &&
    configuredSupabasePinEntries.distinct().size == configuredSupabasePinEntries.size

val validateAndroidCloudConfiguration = tasks.register<ValidateAndroidCloudConfigurationTask>("validateAndroidCloudConfiguration") {
  hasValidHttpsUrl.set(hasValidSupabaseHttpsUrl)
  hasPublicApiKey.set(hasPublicSupabaseApiKey)
  hasValidCertificatePin.set(hasValidSupabaseCertificatePin)
}

val configuredSentryDsn = signingSecret("SENTRY_DSN").orEmpty()
val validateSentryDsnConfiguration = tasks.register<ValidateSentryDsnTask>("validateSentryDsnConfiguration") {
  hasValidDsn.set(
    configuredSentryDsn.startsWith("https://") &&
      configuredSentryDsn.contains("@") &&
      configuredSentryDsn.substringAfter("@").contains("/")
  )
}
val validateSecureMigrationApproval = tasks.register<ValidateSecureMigrationApprovalTask>("validateSecureMigrationApproval") {
  approved.set(signingSecret("SECURE_CREDENTIAL_MIGRATION_APPROVED").equals("true", ignoreCase = true))
  firstProductionRelease.set(signingSecret("ANDROID_FIRST_PRODUCTION_RELEASE").equals("true", ignoreCase = true))
  secureUpdatesApproved.set(signingSecret("ANDROID_SECURE_UPDATES_APPROVED").equals("true", ignoreCase = true))
}
val configuredSecurityPepper = signingSecret("BEBOSS_SECURITY_PEPPER").orEmpty()
val validateCredentialPepperConfiguration = tasks.register<ValidateCredentialPepperTask>("validateCredentialPepperConfiguration") {
  // Only a boolean enters the task; never serialize the pepper into Gradle cache.
  hasValidPepper.set(
    configuredSecurityPepper.length >= 32 &&
      configuredSecurityPepper != "BeBossRuntimeHardwarePepperV2" &&
      configuredSecurityPepper != "DEFAULT_PEPPER_PLACEHOLDER"
  )
}



// Release artifacts require both the real upload key and the same private
// BBSHARE HMAC key configured in the protected Supabase server secret store.
// Capture only scalar configuration values here. Task execution must not reach back
// into Project/file()/providers so configuration-cache serialization remains valid.
val releaseKeystoreConfigured = releaseKeystoreFile?.isFile == true
val releaseCredentialsConfigured =
  !releaseStorePassword.isNullOrBlank() &&
  !releaseKeyPassword.isNullOrBlank() &&
  !releaseKeyAlias.isNullOrBlank()

val validateReleaseSigningConfiguration = tasks.register<ValidateReleaseSigningTask>("validateReleaseSigningConfiguration") {
  hasKeystore.set(releaseKeystoreConfigured)
  hasCredentials.set(releaseCredentialsConfigured)
  // Only a boolean enters the task; the keystore passwords and key material are not cached.
  hasVerifiedCertificate.set(configuredReleaseCertificateMatches)
}

tasks.configureEach {
  val releaseTask = name.contains("Release")
  val releasePackagingTask =
    name.startsWith("validateSigning") ||
      name.startsWith("package") ||
      name.startsWith("bundle") ||
      name.startsWith("assemble") ||
      name.startsWith("sign")
  if (releaseTask && releasePackagingTask) {
    dependsOn(validateReleaseSigningConfiguration)
    dependsOn(validateSentryDsnConfiguration)
    dependsOn(validateAndroidCloudConfiguration)
    if (name.contains("Secure", ignoreCase = true)) {
      dependsOn(validateSecureMigrationApproval)
    }
    if (name.contains("Transition", ignoreCase = true)) {
      dependsOn(validateCredentialPepperConfiguration)
    }
  }
}

dependencies {
  // Shared Kotlin business logic also compiles to a native iOS framework.
  implementation("com.beboss:shared:1.0.0")
  implementation(platform(libs.androidx.compose.bom))
  implementation(libs.accompanist.permissions)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.camera.camera2)
  implementation(libs.androidx.camera.core)
  implementation(libs.androidx.camera.lifecycle)
  implementation(libs.androidx.camera.view)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.compose.material.icons.extended)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.material3.windowsizeclass)
  implementation(libs.androidx.biometric)
  implementation(libs.androidx.fragment.ktx)
  implementation(libs.androidx.appcompat)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  // implementation(libs.androidx.compose.ui.text.google.fonts)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  // implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  // implementation(libs.androidx.navigation.compose)
  implementation(libs.androidx.room.ktx)
  implementation(libs.androidx.room.runtime)
  implementation(libs.androidx.sqlite)
  implementation(libs.sqlcipher.android) {
    artifact {
      type = "aar"
    }
  }
  // implementation(libs.coil.compose)
  implementation(libs.converter.moshi)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  implementation(libs.logging.interceptor)
  implementation(libs.moshi.kotlin)
  implementation(libs.okhttp)
  // implementation(libs.play.services.location)
  implementation(libs.retrofit)
  implementation(libs.androidx.work.runtime.ktx)
  // Production crash and ANR reporting; DSN is a public project identifier, never a server secret.
  implementation("io.sentry:sentry-android:8.64.0")
  implementation(libs.zxing.core)
  implementation(libs.mlkit.barcode.scanning)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.androidx.room.testing)
  testImplementation(libs.androidx.work.testing)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  testImplementation(libs.roborazzi)
  testImplementation(libs.roborazzi.compose)
  testImplementation(libs.roborazzi.junit.rule)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
  "ksp"(libs.androidx.room.compiler)
  "ksp"(libs.moshi.kotlin.codegen)
}
