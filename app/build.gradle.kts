import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.roborazzi)
  alias(libs.plugins.secrets)
}


// Configuration-cache-safe signing gates. These tasks receive booleans only:
// no signing secret, password, key bytes, or Gradle script object is serialized
// into the task action or Gradle configuration cache.
abstract class ValidateDataShareSigningTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Input
  abstract val hasValidSecret: org.gradle.api.provider.Property<Boolean>

  @org.gradle.api.tasks.TaskAction
  fun validate() {
    if (!hasValidSecret.get()) {
      throw org.gradle.api.GradleException(
        "Android DataShare signing is not configured. Set BEBOSS_DATASHARE_HMAC_SECRET to the same protected 32+ character key stored as BEBOSS_DATASHARE_HMAC_SECRET in Supabase. The public fallback key is not accepted for production releases."
      )
    }
  }
}

abstract class ValidateReleaseSigningTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Input
  abstract val hasKeystore: org.gradle.api.provider.Property<Boolean>

  @get:org.gradle.api.tasks.Input
  abstract val hasCredentials: org.gradle.api.provider.Property<Boolean>

  @org.gradle.api.tasks.TaskAction
  fun validate() {
    if (!hasKeystore.get() || !hasCredentials.get()) {
      throw org.gradle.api.GradleException(
        "Release signing is not configured. Set KEYSTORE_PATH, STORE_PASSWORD, KEY_PASSWORD and KEY_ALIAS in the ignored root .env file or protected CI secrets. A debug keystore is never accepted for release builds."
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

android {
  namespace = "com.beboss.shopmgmt"
  compileSdk = 36

  defaultConfig {
    applicationId = "com.beboss.shopmgmt"
    minSdk = 24
    targetSdk = 36
    versionCode = 16
    versionName = "2.3.2"

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
  val envProps = Properties().apply {
    putAll(defaultEnvProps)
    val envFile = rootProject.file(".env")
    if (envFile.exists()) {
      envFile.inputStream().use { load(it) }
    }
  }
  fun envConfigString(key: String): String {
    // Explicit developer/CI overrides win; .env.example is only the final fallback.
    // This prevents a stale example key from masking a rotated project key in CI.
    val raw = (
      envProps.getProperty(key)?.takeIf { it.isNotBlank() }
        ?: (project.findProperty(key) as? String)?.takeIf { it.isNotBlank() }
        ?: System.getenv(key)?.takeIf { it.isNotBlank() }
        ?: defaultEnvProps.getProperty(key)?.takeIf { it.isNotBlank() }
        ?: ""
      ).trim()
    val unquoted = raw.removeSurrounding("\"")
    val escaped = unquoted.replace("\\", "\\\\").replace("\"", "\\\"")
    return "\"$escaped\""
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
      buildConfigField("String", "BEBOSS_DATASHARE_HMAC_SECRET", envConfigString("BEBOSS_DATASHARE_HMAC_SECRET"))
      buildConfigField("String", "BEBOSS_LAN_SYNC_SECRET", envConfigString("BEBOSS_LAN_SYNC_SECRET"))
      buildConfigField("String", "BEBOSS_SECURITY_PEPPER", envConfigString("BEBOSS_SECURITY_PEPPER"))
      buildConfigField("String", "SENTRY_DSN", envConfigString("SENTRY_DSN"))
      buildConfigField("String", "SUPABASE_ANON_KEY", envConfigString("SUPABASE_ANON_KEY"))
      buildConfigField("String", "SUPABASE_CERT_PINS", envConfigString("SUPABASE_CERT_PINS"))
      buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", envConfigString("SUPABASE_PUBLISHABLE_KEY"))
      buildConfigField("String", "SUPABASE_URL", envConfigString("SUPABASE_URL"))
    }
    debug { 
      signingConfig = signingConfigs.getByName("debugConfig") 
      buildConfigField("String", "BEBOSS_ADMIN_URL", envConfigString("BEBOSS_ADMIN_URL"))
      buildConfigField("String", "BEBOSS_ADMIN_WHATSAPP", envConfigString("BEBOSS_ADMIN_WHATSAPP"))
      buildConfigField("String", "BEBOSS_DATASHARE_HMAC_SECRET", envConfigString("BEBOSS_DATASHARE_HMAC_SECRET"))
      buildConfigField("String", "BEBOSS_LAN_SYNC_SECRET", envConfigString("BEBOSS_LAN_SYNC_SECRET"))
      buildConfigField("String", "BEBOSS_SECURITY_PEPPER", envConfigString("BEBOSS_SECURITY_PEPPER"))
      buildConfigField("String", "SENTRY_DSN", envConfigString("SENTRY_DSN"))
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

// Configure the Secrets Gradle Plugin to use .env and .env.example files
// to match the convention used in Web projects.
secrets {
  propertiesFileName = ".env"
  defaultPropertiesFileName = ".env.example"
  // This value is supplied explicitly with buildConfigField below. Exclude it from
  // the Secrets plugin so blank .env.example entries cannot generate invalid Java.
  ignoreList.add("BEBOSS_DATASHARE_HMAC_SECRET")
  ignoreList.add("BEBOSS_ADMIN_URL")
  ignoreList.add("BEBOSS_ADMIN_WHATSAPP")
  ignoreList.add("BEBOSS_LAN_SYNC_SECRET")
  ignoreList.add("BEBOSS_SECURITY_PEPPER")
  ignoreList.add("FIREBASE_APPCHECK_DEBUG_TOKEN")
  ignoreList.add("SENTRY_DSN")
  ignoreList.add("SUPABASE_ANON_KEY")
  ignoreList.add("SUPABASE_CERT_PINS")
  ignoreList.add("SUPABASE_PUBLISHABLE_KEY")
  ignoreList.add("SUPABASE_URL")
  // Payment provider keys and the canonical website URL are server-only.
  // Never generate Android BuildConfig constants or ship them in an APK.
  ignoreList.add("BEBOSS_PUBLIC_URL")
  ignoreList.add("FLW_SECRET_KEY")
  ignoreList.add("FLW_WEBHOOK_SECRET_HASH")
  ignoreList.add("STRIPE_SECRET_KEY")
  ignoreList.add("STRIPE_WEBHOOK_SECRET")
  ignoreList.add("VITE_SUPABASE_URL")
  ignoreList.add("VITE_SUPABASE_PUBLISHABLE_KEY")
  ignoreList.add("SUPABASE_SERVICE_ROLE_KEY")
  // Upload-keystore credentials are consumed only by Gradle signing configuration.
  // Never generate them as Java/Kotlin BuildConfig constants or embed them in APKs.
  ignoreList.add("KEYSTORE_PATH")
  ignoreList.add("STORE_PASSWORD")
  ignoreList.add("KEY_PASSWORD")
  ignoreList.add("KEY_ALIAS")
}

// Release signing and cross-platform data-share signing are independent gates.
val dataShareEnvProperties = Properties().apply {
  val envFile = rootProject.file(".env")
  if (envFile.isFile) envFile.inputStream().use { load(it) }
}
val configuredDataShareHmacSecret = (
  dataShareEnvProperties.getProperty("BEBOSS_DATASHARE_HMAC_SECRET")?.takeIf { it.isNotBlank() }
    ?: (findProperty("BEBOSS_DATASHARE_HMAC_SECRET") as? String)?.takeIf { it.isNotBlank() }
    ?: providers.environmentVariable("BEBOSS_DATASHARE_HMAC_SECRET").orNull?.takeIf { it.isNotBlank() }
    ?: ""
  ).trim().removeSurrounding("\"")

val validateDataShareSigningConfiguration = tasks.register<ValidateDataShareSigningTask>("validateDataShareSigningConfiguration") {
  // Pass a boolean only: never capture or serialize the HMAC key itself.
  hasValidSecret.set(
    configuredDataShareHmacSecret.length >= 32 &&
      configuredDataShareHmacSecret != "BeBossDefaultDataShareHmacKeyV2"
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
}

tasks.configureEach {
  if (
    name.startsWith("validateSigningRelease") ||
    name.startsWith("packageRelease") ||
    name.startsWith("bundleRelease") ||
    name.startsWith("assembleRelease") ||
    name.startsWith("signRelease")
  ) {
    dependsOn(validateReleaseSigningConfiguration)
    dependsOn(validateDataShareSigningConfiguration)
  }
}

dependencies {
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
