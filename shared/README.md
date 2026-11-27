# BeBoss shared Kotlin core

This is a Kotlin Multiplatform build included alongside the existing Android application. It deliberately does not replace the Android app module.

## What is shared now

- Exact decimal-to-minor-unit conversion for POS prices, totals and balances
- Price × quantity calculation with decimal rounding applied once at the final currency boundary
- Currency rounding and cents conversion

The Android app calls this same implementation through its existing `MoneyUtils` facade. The iOS framework exports the same Kotlin implementation to Swift.

## Targets

- Android library: consumed by the existing Kotlin/Jetpack Compose Android application
- iOS device: `iosArm64` only

No iOS simulator target or emulator workflow is defined.

## Build the shared code for an actual iPhone architecture

From the repository root on macOS with Xcode installed:

```sh
./gradlew -p shared :linkReleaseFrameworkIosArm64
```

The resulting device framework is written to:

```
shared/build/bin/iosArm64/releaseFramework/BeBossShared.framework
```

The root Android build resolves `com.beboss:shared:1.0.0` from this included build, so Android and iOS use the same Kotlin implementation.

## Migration boundary

The current Android application is a native Kotlin/Jetpack Compose app with 134 Kotlin source files. Its Room/SQLCipher database, Android Keystore credentials, WorkManager scheduling, CameraX barcode scanning, Android biometrics, Android installer and Bluetooth integrations are platform-specific. They are intentionally not copied into iOS or stubbed as if they were portable.

Continue moving portable domain logic and serialization into `commonMain`. Put Apple Keychain, iOS background scheduling, camera, Face ID/Touch ID, local persistence and printer transport behind iOS implementations. Keep the Android implementations in the existing `app` module until each shared service has an equivalent, tested iOS implementation. Preserve database schema and sync wire-format compatibility during each move.
