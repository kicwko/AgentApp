# Running Kweecko Agent App Locally

This covers everything needed to get this React Native app (Android + iOS) running
on your machine, including the project-specific Firebase/Google Sign-In setup and
the fixes already baked into the repo for issues you'd otherwise hit fresh.

---

## 1. Prerequisites (both platforms)

| Tool | Why | Check |
|---|---|---|
| Node.js 22.11+ | JS runtime / tooling | `node -v` |
| npm | Package manager | `npm -v` |
| Ruby + Bundler | iOS tooling (CocoaPods is Ruby-based) | `bundle -v` |

Install project dependencies once:

```sh
npm install
bundle install
```

---

## 2. Firebase config files (required for both platforms)

This app uses Firebase Auth (Email/Password + Google Sign-In). Two config files
are needed that are **not safe to commit publicly** (they contain project-specific
keys) — get them from the Firebase Console for this project (`kweecko-2026`):

| File | Platform | Where it goes |
|---|---|---|
| `google-services.json` | Android | `android/app/google-services.json` |
| `GoogleService-Info.plist` | iOS | `ios/AgentApp/GoogleService-Info.plist` |

Get them from **Firebase Console → Project Settings → Your apps**, pick the
Android or iOS app, and download the respective file. If they're missing, the
app will build but Firebase calls will fail at runtime.

> The iOS file additionally needs to be added to the Xcode project (file
> reference + Resources build phase) — already done for the current file. If you
> ever replace it, re-add it via Xcode (drag into the `AgentApp` group, check
> "Copy items if needed" and the `AgentApp` target).

---

## 3. Android setup

### One-time machine setup

1. Install **Android Studio**: https://developer.android.com/studio
   - On first launch, choose "Standard" install — this installs the Android SDK,
     an emulator, and a bundled JDK.
2. Add these to your shell profile (`~/.zshrc`):

   ```sh
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/emulator"
   export PATH="$PATH:$ANDROID_HOME/platform-tools"

   # Use Android Studio's bundled JDK — the system Java is usually too old
   # (this project needs JDK 17+; Gradle 9.x / AGP need a recent JDK).
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export PATH="$JAVA_HOME/bin:$PATH"
   ```

   Open a **new** terminal tab after editing this file — existing tabs won't
   pick up the change.
3. Create an emulator via Android Studio's **Device Manager** if one doesn't
   exist yet (any recent Pixel/Phone profile works).

### Google Sign-In on Android — SHA-1 fingerprint

Google Sign-In only works if the app's signing certificate fingerprint is
registered with the Firebase project. This is **already done** for the debug
keystore committed in this repo (`android/app/debug.keystore`):

```
SHA-1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

You only need to redo this if you regenerate/replace the debug keystore, or
when building a **release** APK with a different signing key — in that case:

```sh
keytool -list -v -keystore <your-keystore> -alias <alias> -storepass <pass> -keypass <pass>
```

...then add that SHA-1 in **Firebase Console → Project Settings → Your apps →
Android app → Add fingerprint**, and re-download `google-services.json`.

### Run it

```sh
# Terminal 1 — leave this running
npx react-native start

# Terminal 2
npx react-native run-android
```

This builds the native app, installs it on a running/booted emulator, and
launches it connected to Metro. If no emulator is running, start one first
from Android Studio's Device Manager (or `emulator -avd <name>`).

### Why some things are already in the config (don't remove)

- `android/build.gradle` has a `subprojects { ... }` block adding
  `-Xskip-metadata-version-check` for the `react-native-firebase_auth` module.
  This works around `@react-native/gradle-plugin` (bundled with RN 0.88.1)
  pinning Kotlin to 2.2.0, while `firebase-auth` 25.x ships Kotlin 2.4.0
  metadata. Remove this only once the RN version in use bundles Kotlin ≥2.4.0.

---

## 4. iOS setup

### One-time machine setup

1. Install **Xcode** from the Mac App Store (not available as a direct
   download). This can take a while (15GB+).
2. Point command-line tools at it and accept the license:

   ```sh
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
3. Install pods:

   ```sh
   cd ios
   bundle exec pod install
   cd ..
   ```

### Run it

```sh
# Terminal 1 — leave this running (reuse the same one as Android if already open)
npx react-native start

# Terminal 2
npx react-native run-ios --simulator="iPhone 17"
```

Or open `ios/AgentApp.xcworkspace` in Xcode (⚠️ not `.xcodeproj`) and hit Run.

### Why some things are already in the config (don't remove)

- **`ios/Podfile`: `use_frameworks! :linkage => :dynamic`** — react-native-firebase
  resolves Firebase on iOS via Swift Package Manager, whose packages are
  static-only. Without forcing dynamic linkage here, you get duplicate-symbol
  errors at link time. See https://rnfirebase.io/ios-spm.
- **`ios/Podfile`: `post_install` deployment-target fix** — some pods' privacy
  manifest resource targets (PromisesObjC, GoogleUtilities, etc.) ship an old
  `IPHONEOS_DEPLOYMENT_TARGET` (9.0/12.0) that recent Xcode versions reject
  outright. The hook force-bumps every pod target to the project's minimum.
- **`ios/AgentApp/AppDelegate.swift`: `FirebaseApp.configure()`** — unlike
  Android (auto-configured by the Google Services Gradle plugin at build
  time), iOS needs this explicit call before any JS code touches
  `@react-native-firebase/*`, or you get `No Firebase App '[DEFAULT]' has been
  created`.

If you ever re-run `pod install` and it fails on the Swift/static-library
modular-headers error, it means `use_frameworks!` got reverted — check the
Podfile hasn't been edited/reset.

---

## 5. Day-to-day workflow

- Metro must be running (`npx react-native start`) whenever you're using the
  app in debug mode — a blank/white screen almost always means Metro isn't
  reachable (check `curl http://localhost:8081/status`).
- JS/TS changes: just save, Fast Refresh picks it up. No rebuild needed.
- Native changes (anything under `android/` or `ios/`, or adding a new native
  dependency): re-run `run-android` / `run-ios` to rebuild.

## 6. Troubleshooting quick reference

| Symptom | Likely cause |
|---|---|
| Blank/white screen on launch | Metro isn't running, or app lost connection to it — restart Metro and relaunch the app |
| `adb: command not found` / `emulator -list-avds` finds nothing | `ANDROID_HOME`/`PATH` not set in this shell — open a new terminal tab |
| `Gradle requires JVM 17 or later` | `JAVA_HOME` not set to Android Studio's JDK in this shell |
| Gradle distribution download times out | Flaky/slow network — retry; if it persists, download the zip with `curl` directly into `~/.gradle/wrapper/dists/<version>/<hash>/` |
| Google Sign-In: picker opens but sign-in fails ("something went wrong") | SHA-1 fingerprint not registered for the keystore you're building with — see §3 |
| iOS: `No Firebase App '[DEFAULT]' has been created` | `FirebaseApp.configure()` missing/removed from `AppDelegate.swift` |
| iOS: duplicate symbol errors at link time | `use_frameworks! :linkage => :dynamic` missing/removed from `Podfile` |
