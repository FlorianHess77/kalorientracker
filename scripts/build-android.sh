#!/usr/bin/env bash
# Baut die Android-App (APK) aus der Web-App – mit Capacitor, alles offline in der App enthalten.
# Läuft im GitHub-Workflow .github/workflows/android.yml. Lokal: braucht Node 20+, Java 21 und das Android SDK.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION_NAME=$(node -e "const s=require('fs').readFileSync('js/main.js','utf8');console.log(s.match(/APP_VERSION = '([^']+)'/)[1])")
VERSION_CODE=${GITHUB_RUN_NUMBER:-1}
echo "▶ Version $VERSION_NAME ($VERSION_CODE)"

echo "▶ Web-Dateien zusammenstellen"
rm -rf www && mkdir -p www
cp -r index.html manifest.webmanifest css js assets www/
[ -d models ] && cp -r models www/
[ -d vendor ] && cp -r vendor www/
ls -la www www/models www/vendor/tfjs 2>/dev/null | head -40 || true

echo "▶ Capacitor installieren"
npm install --no-audit --no-fund \
  @capacitor/core @capacitor/cli @capacitor/android @capacitor/filesystem @capacitor/share
npm install --no-audit --no-fund --no-save sharp
npx cap --version

echo "▶ Android-Projekt erzeugen"
[ -d android ] || npx cap add android
npx cap sync android

MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q 'android.permission.CAMERA' "$MANIFEST"; then
  # Kamera für Fotos und Barcode-Scanner
  sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />#' "$MANIFEST"
fi
grep -n "permission\|uses-feature" "$MANIFEST"

echo "▶ App-Symbol und Startbild"
node scripts/android-icons.mjs

echo "▶ Signatur und Version"
KEYSTORE="$(pwd)/android-signing/kalorientracker.keystore"
if [ -f android/app/build.gradle ]; then
  cat >> android/app/build.gradle <<EOF

// ── Kalorientracker: Signatur und Version ──
android {
    signingConfigs {
        kalorientracker {
            storeFile file("$KEYSTORE")
            storePassword "kalorientracker"
            keyAlias "kalorientracker"
            keyPassword "kalorientracker"
        }
    }
    defaultConfig {
        versionCode $VERSION_CODE
        versionName "$VERSION_NAME"
    }
    buildTypes {
        release {
            signingConfig signingConfigs.kalorientracker
            minifyEnabled false
        }
    }
}
EOF
else
  cat >> android/app/build.gradle.kts <<EOF

// ── Kalorientracker: Signatur und Version ──
android {
    signingConfigs {
        create("kalorientracker") {
            storeFile = file("$KEYSTORE")
            storePassword = "kalorientracker"
            keyAlias = "kalorientracker"
            keyPassword = "kalorientracker"
        }
    }
    defaultConfig {
        versionCode = $VERSION_CODE
        versionName = "$VERSION_NAME"
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("kalorientracker")
            isMinifyEnabled = false
        }
    }
}
EOF
fi

echo "▶ APK bauen"
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon --stacktrace
cd ..
APK=$(find android/app/build/outputs/apk/release -name '*.apk' | head -n 1)
cp "$APK" kalorientracker.apk
ls -la kalorientracker.apk
echo "✓ Fertig: kalorientracker.apk"
