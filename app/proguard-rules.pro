# Preserve line numbers and source file attributes for actionable crash stack traces
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Room Database Preservation & SQLCipher
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }
-keep class androidx.room.** { *; }
-dontwarn androidx.room.paging.**
-keep class net.zetetic.database.sqlcipher.** { *; }
-dontwarn net.zetetic.database.sqlcipher.**

# BeBoss Application Models, DAOs, Repositories, ViewModels, Coordinators & Utilities
-keep class com.beboss.shopmgmt.** { *; }
-keep class com.beboss.shopmgmt.data.** { *; }
-keep class com.beboss.shopmgmt.ui.** { *; }
-keep class com.beboss.shopmgmt.util.** { *; }
-keep class com.beboss.shopmgmt.domain.** { *; }

# Data Models and Moshi JSON Serialization
-keepclassmembers class * {
    @com.squareup.moshi.* <fields>;
}
-keep class com.squareup.moshi.** { *; }

# Android Keystore and Cryptographic Providers
-keep class javax.crypto.** { *; }
-keep class java.security.** { *; }
-keep class net.zetetic.** { *; }
-dontwarn net.zetetic.**
-keep class androidx.sqlite.** { *; }
-keep class androidx.biometric.** { *; }

# Jetpack Compose and Lifecycle
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**
-keep class androidx.lifecycle.** { *; }

# Coroutines and Flow
-keepclassmembers class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# OkHttp optional TLS providers
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**

# Strip verbose/debug logs in release builds
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
}
