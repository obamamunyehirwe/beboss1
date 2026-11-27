# BeBoss shared Kotlin core

This directory is a Kotlin Multiplatform source set compiled twice from the same source files:

- The existing Android application compiles `commonMain` directly using its existing Android/Kotlin toolchain.
- Kotlin Multiplatform compiles that same `commonMain` into a native `iosArm64` framework for physical iPhones and iPads.

This avoids changing the current Android Gradle plugin, Kotlin compiler, signing flavors, Room database, or Android release pipeline.

## Shared code migrated so far

- Exact decimal-to-minor-unit conversion used for POS prices, totals and balances
- Price × quantity calculations with rounding only at the final currency boundary
- Currency rounding and cents conversion
- Hybrid Logical Clock packing, ticking, remote observation and deterministic version conflict ordering

The Android `MoneyUtils` and `HlcClock` APIs remain in place as adapters, but delegate their calculations and causal-order rules to the shared Kotlin source.

## Build for a physical iPhone/iPad

On macOS with Xcode and the iOS device SDK installed:

```sh
./gradlew -p shared :linkReleaseFrameworkIosArm64
```

The device framework is generated at:

```
shared/build/bin/iosArm64/releaseFramework/BeBossShared.framework
```

The framework is not an installable app by itself. A native iOS application target must link it and provide Apple platform services.

## Why the Android implementation is not copied wholesale

The Android project currently contains 134 Kotlin files. Its Jetpack Compose entry point, Room/SQLCipher storage, Android Keystore, WorkManager, CameraX, Android biometrics, Bluetooth/USB printing and Android APK updater rely on Android APIs. They cannot run on iOS unchanged.

Move platform-neutral business rules, data contracts, pricing, sync validation and conflict resolution to `commonMain`. Implement iOS services using Apple Keychain, an iOS-compatible encrypted database, native background tasks, camera/Face ID permissions and certified printer transports. Keep the Android implementations in `app` until each iOS counterpart is ready. Preserve Room schema, cloud payload formats and pending sync records during migration.
