plugins {
    id("org.jetbrains.kotlin.multiplatform") version "2.4.21"
}

kotlin {
    // The iOS framework is built for real iPhone/iPad hardware only.
    // No iOS simulator or simulator architecture is configured.
    iosArm64 {
        binaries.framework {
            baseName = "BeBossShared"
            isStatic = true
        }
    }
}
