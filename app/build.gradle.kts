import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.roborazzi)
  alias(libs.plugins.secrets)
}

android {
  namespace = "com.beboss.shopmgmt"
  compileSdk = 36

  defaultConfig {
    applicationId = "com.beboss.shopmgmt"
    minSdk = 24
    targetSdk = 36
    versionCode = 15
    versionName = "2.3.1"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  signingConfigs {
    create("release") {
      val keystorePath = System.getenv("KEYSTORE_PATH") ?: "${rootDir}/my-upload-key.jks"
      val keystoreFile = file(keystorePath)
      if (keystoreFile.exists()) {
        storeFile = keystoreFile
        storePassword = System.getenv("STORE_PASSWORD")
        keyAlias = "upload"
        keyPassword = System.getenv("KEY_PASSWORD")
      } else {
        val rootKeystore = file("${rootDir}/debug.keystore")
        val userKeystore = file("${System.getProperty("user.home")}/.android/debug.keystore")
        storeFile = if (rootKeystore.exists()) rootKeystore else userKeystore
        storePassword = "android"
        keyAlias = "androiddebugkey"
        keyPassword = "android"
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
  ignoreList.add("BEBOSS_ADMIN_URL")
  ignoreList.add("BEBOSS_ADMIN_WHATSAPP")
  ignoreList.add("BEBOSS_DATASHARE_HMAC_SECRET")
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
