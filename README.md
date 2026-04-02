# Storybook

A simple Android app for telling stories to kids, designed for a 6" color e-ink tablet.

## Tech Stack

- **Language**: Kotlin
- **UI**: Jetpack Compose with Material 3
- **Min SDK**: 30 (Android 11)
- **Target SDK**: 35
- **Build**: Gradle 8.11.1 with Kotlin DSL

## Prerequisites

- [Android Studio](https://developer.android.com/studio) (provides JBR and SDK)
- Android SDK Platform 35
- Android SDK Build-Tools 35

## Setup

1. Clone the repo
2. Open in Android Studio, or build from the command line (see below)
3. The SDK path is configured via `local.properties` (not checked in) — create one if needed:
   ```
   sdk.dir=/Users/<you>/Library/Android/sdk
   ```

## Build

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew assembleDebug
```

The debug APK is output to `app/build/outputs/apk/debug/app-debug.apk`.

## Install & Run

**On emulator:**
```bash
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -n com.gooley.storybook/.MainActivity
```

**On physical device (HiBreak e-ink tablet):**
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.gooley.storybook/.MainActivity
```

## Project Structure

```
├── settings.gradle.kts          # Project settings & repositories
├── build.gradle.kts             # Root build config & plugin versions
├── gradle.properties            # Gradle/Android build properties
└── app/
    ├── build.gradle.kts         # App module: dependencies, SDK versions
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/gooley/storybook/
        │   ├── MainActivity.kt          # Main Compose activity
        │   └── ui/theme/Theme.kt        # Material 3 color theme
        └── res/values/
            ├── strings.xml
            └── themes.xml
```
