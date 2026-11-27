plugins {
    id("org.jetbrains.kotlin.multiplatform") version "2.4.20"
    id("com.android.kotlin.multiplatform.library") version "9.1.1"
}

group = "com.beboss"
version = "1.0.0"

kotlin {
    androidLibrary {
        namespace = "com.beboss.shared"
        compileSdk = 36
        minSdk = 24
    }

    // Physical iPhone/iPad architecture only. No simulator target is declared.
    iosArm64 {
        binaries.framework {
            baseName = "BeBossShared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
        }

        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
