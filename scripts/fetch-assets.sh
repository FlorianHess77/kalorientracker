#!/usr/bin/env bash
# Lädt Foto-Erkennungsmodell, Labelliste und die JavaScript-Bibliotheken nach models/ und vendor/.
# Läuft automatisch im GitHub-Workflow. Lokal: bash scripts/fetch-assets.sh  (braucht curl und Node.js)
# Schlägt ein Download fehl, funktioniert die App trotzdem – sie lädt die Dateien dann direkt aus dem Internet.

set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p models vendor/tfjs vendor/zxing
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

get() { curl -fsSL --retry 3 --retry-delay 2 -o "$2" "$1"; }

# ── Modell (Google AIY Vision Classifier Food V1, TFLite) ──
if [ ! -s models/aiy_food_V1.tflite ]; then
  echo "Lade Modell …"
  if get "https://storage.googleapis.com/tfhub-lite-models/google/lite-model/aiy/vision/classifier/food_V1/1.tflite" models/aiy_food_V1.tflite; then
    echo "  ✓ von Google Storage"
  elif get "https://tfhub.dev/google/lite-model/aiy/vision/classifier/food_V1/1?lite-format=tflite" models/aiy_food_V1.tflite; then
    echo "  ✓ über TF Hub"
  elif get "https://www.kaggle.com/api/v1/models/google/aiy/tfLite/vision-classifier-food-v1/1/download" "$TMP/model.tgz" \
       && tar -xzf "$TMP/model.tgz" -C "$TMP" && cp "$(find "$TMP" -name '*.tflite' | head -n 1)" models/aiy_food_V1.tflite; then
    echo "  ✓ über Kaggle"
  else
    rm -f models/aiy_food_V1.tflite
    echo "  ⚠ Modell nicht geladen – die App versucht es später direkt aus dem Internet."
  fi
fi

# ── Labelliste → JSON ──
echo "Lade Labelliste …"
if get "https://www.gstatic.com/aihub/tfhub/labelmaps/aiy_food_V1_labelmap.csv" "$TMP/labels.csv"; then
  node -e '
    const fs = require("fs");
    const labels = [];
    for (const line of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const i = line.indexOf(",");
      const id = Number(line.slice(0, i));
      if (Number.isInteger(id)) labels[id] = line.slice(i + 1).replace(/"/g, "").trim();
    }
    fs.writeFileSync("models/aiy_food_V1_labels.json", JSON.stringify(Array.from(labels, (l) => l ?? "")));
    console.log("  ✓ " + labels.length + " Labels");
  ' "$TMP/labels.csv"
else
  echo "  ⚠ Labelliste nicht geladen."
fi

# ── Bibliotheken (TensorFlow.js TFLite, ZXing für Barcodes auf iPhones) ──
echo "Lade Bibliotheken …"
if npm install --silent --no-audit --no-fund --prefix "$TMP/npm" \
     @tensorflow/tfjs-core @tensorflow/tfjs-backend-cpu @tensorflow/tfjs-tflite @zxing/library@0.21.3 >/dev/null 2>&1; then
  M="$TMP/npm/node_modules"
  cp "$M/@tensorflow/tfjs-core/dist/tf-core.min.js" vendor/tfjs/
  cp "$M/@tensorflow/tfjs-backend-cpu/dist/tf-backend-cpu.min.js" vendor/tfjs/
  cp "$M/@tensorflow/tfjs-tflite/dist/tf-tflite.min.js" vendor/tfjs/
  cp "$M"/@tensorflow/tfjs-tflite/dist/tflite_web_api* vendor/tfjs/
  cp "$M/@zxing/library/umd/index.min.js" vendor/zxing/zxing.min.js
  echo "  ✓ Bibliotheken abgelegt"
else
  echo "  ⚠ npm nicht verfügbar – die App lädt die Bibliotheken dann vom CDN."
fi

ls -la models vendor/tfjs vendor/zxing 2>/dev/null || true

# Übersicht, welche Dateien vorhanden sind (zur Kontrolle unter …/build-info.json)
node -e '
  const fs = require("fs");
  const size = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
  const files = ["models/aiy_food_V1.tflite", "models/aiy_food_V1_labels.json", "vendor/tfjs/tf-core.min.js",
    "vendor/tfjs/tf-backend-cpu.min.js", "vendor/tfjs/tf-tflite.min.js", "vendor/zxing/zxing.min.js"];
  const wasm = fs.existsSync("vendor/tfjs") ? fs.readdirSync("vendor/tfjs").filter((f) => f.startsWith("tflite_web_api")) : [];
  fs.writeFileSync("build-info.json", JSON.stringify({ builtAt: new Date().toISOString(), files: Object.fromEntries(files.map((f) => [f, size(f)])), wasm }, null, 2));
'
cat build-info.json
exit 0
