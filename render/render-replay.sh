#!/usr/bin/env bash
set -euo pipefail

REPLAY_FILE="${1:?Usage: ./render-replay.sh <replay.json> [output.mp4]}"
OUTPUT_FILE="${2:-}"

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REPLAY_PATH="$(realpath "$REPLAY_FILE")"
VENV_PYTHON="${PROJECT_DIR}/.venv/bin/python"

if [ ! -f "$REPLAY_PATH" ]; then
  echo "Error: Replay file not found: $REPLAY_PATH" >&2
  exit 1
fi

# Default output: videos/{basename}.mp4
if [ -z "$OUTPUT_FILE" ]; then
  BASENAME="$(basename "$REPLAY_PATH" .json)"
  OUTPUT_FILE="${PROJECT_DIR}/videos/${BASENAME}.mp4"
else
  OUTPUT_FILE="$(realpath -m "$OUTPUT_FILE")"
fi

# Step 1: Generate TTS announcement
TTS_OUT="${SCRIPT_DIR}/public/tts/announce.mp3"
mkdir -p "$(dirname "$TTS_OUT")"
echo "Generating TTS..."
"$VENV_PYTHON" "${SCRIPT_DIR}/generate-tts.py" "$REPLAY_PATH" "$TTS_OUT"

# Step 2: Create props file with available SFX list
PROPS_TMP="$(mktemp /tmp/slm-arena-props-XXXXXX.json)"
trap 'rm -f "$PROPS_TMP"' EXIT

node -e "
  const fs = require('fs');
  const path = require('path');
  const replay = JSON.parse(fs.readFileSync('$REPLAY_PATH', 'utf-8'));

  // Scan available SFX files
  const sfxDir = path.join('$SCRIPT_DIR', 'public', 'sfx');
  const availableSfx = [];
  function scanDir(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        scanDir(full, prefix ? prefix + '/' + f : f);
      } else {
        availableSfx.push(prefix ? prefix + '/' + f : f);
      }
    }
  }
  scanDir(sfxDir, '');

  fs.writeFileSync('$PROPS_TMP', JSON.stringify({ replay, availableSfx }));
  if (availableSfx.length > 0) {
    console.log('SFX available: ' + availableSfx.join(', '));
  } else {
    console.log('No SFX files found (skipping sound effects)');
  }
"

# Step 3: Render
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "Rendering: $(basename "$REPLAY_PATH")"
echo "Output:    $OUTPUT_FILE"

cd "$SCRIPT_DIR"
npx remotion render SlmArenaMatch "$OUTPUT_FILE" --props "$PROPS_TMP"

echo "Done: $OUTPUT_FILE"
