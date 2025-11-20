#!/usr/bin/env bash

# Usage:
#   ./extract_audio.sh "https://dictionary.cambridge.org/dictionary/english-spanish/spur"

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <cambridge-dictionary-url>" >&2
  exit 1
fi

URL="$1"

echo "🔍 Fetching URL: $URL" >&2

# Extract base URL (scheme + host), e.g. https://dictionary.cambridge.org
BASE_URL=$(printf '%s\n' "$URL" | awk -F/ '{print $1"//"$3}')
echo "🌐 Base URL: $BASE_URL" >&2

# Download page HTML
echo "📥 Downloading page HTML..." >&2
HTML=$(curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "$URL")

# Check if we got any content
if [ -z "$HTML" ]; then
  echo "❌ Error: No HTML content received" >&2
  exit 1
fi

echo "✅ Page downloaded ($(echo "$HTML" | wc -c) bytes)" >&2

# Count audio/mpeg occurrences
AUDIO_COUNT=$(echo "$HTML" | grep -ic 'type="audio/mpeg"' || true)
echo "🔊 Found $AUDIO_COUNT audio/mpeg elements" >&2

# Count us_pron occurrences
US_PRON_COUNT=$(echo "$HTML" | grep -ic 'us_pron' || true)
echo "🇺🇸 Found $US_PRON_COUNT us_pron elements" >&2

# Count uk_pron occurrences
UK_PRON_COUNT=$(echo "$HTML" | grep -ic 'uk_pron' || true)
echo "🇬🇧 Found $UK_PRON_COUNT uk_pron elements" >&2

echo "" >&2
echo "📝 Extracting pronunciation information..." >&2

# Extract UK pronunciation
UK_AUDIO=$(
  echo "$HTML" \
    | grep -i 'type="audio/mpeg"' \
    | grep 'uk_pron' \
    | head -n 1 \
    | sed -n 's/.*src="\([^"]*\)".*/\1/p'
)

# Extract UK IPA - first IPA in document (UK comes first in Cambridge)
UK_IPA=$(
  echo "$HTML" \
    | grep -o 'class="ipa dipa[^"]*">[^<]*<' \
    | sed 's/class="ipa dipa[^"]*">//; s/<$//' \
    | head -n 1
)

# Extract US pronunciation
US_AUDIO=$(
  echo "$HTML" \
    | grep -i 'type="audio/mpeg"' \
    | grep 'us_pron' \
    | head -n 1 \
    | sed -n 's/.*src="\([^"]*\)".*/\1/p'
)

# Extract US IPA - second IPA in document
US_IPA=$(
  echo "$HTML" \
    | grep -o 'class="ipa dipa[^"]*">[^<]*<' \
    | sed 's/class="ipa dipa[^"]*">//; s/<$//' \
    | sed -n '2p'
)

# Build JSON output
JSON_ARRAY="["
ITEMS_ADDED=0

if [ -n "$UK_IPA" ] || [ -n "$UK_AUDIO" ]; then
  echo "✅ Found UK pronunciation" >&2
  [ -n "$UK_IPA" ] && echo "   IPA: $UK_IPA" >&2
  [ -n "$UK_AUDIO" ] && echo "   Audio: $UK_AUDIO" >&2

  [ $ITEMS_ADDED -gt 0 ] && JSON_ARRAY="${JSON_ARRAY},"

  UK_AUDIO_URL=""
  if [ -n "$UK_AUDIO" ]; then
    case "$UK_AUDIO" in
      http://*|https://*)
        UK_AUDIO_URL="$UK_AUDIO"
        ;;
      *)
        UK_AUDIO_URL="${BASE_URL}${UK_AUDIO}"
        ;;
    esac
  fi

  JSON_ARRAY="${JSON_ARRAY}{\"region\":\"UK\",\"ipa\":\"$UK_IPA\",\"audioUrl\":\"$UK_AUDIO_URL\"}"
  ITEMS_ADDED=$((ITEMS_ADDED + 1))
fi

if [ -n "$US_IPA" ] || [ -n "$US_AUDIO" ]; then
  echo "✅ Found US pronunciation" >&2
  [ -n "$US_IPA" ] && echo "   IPA: $US_IPA" >&2
  [ -n "$US_AUDIO" ] && echo "   Audio: $US_AUDIO" >&2

  [ $ITEMS_ADDED -gt 0 ] && JSON_ARRAY="${JSON_ARRAY},"

  US_AUDIO_URL=""
  if [ -n "$US_AUDIO" ]; then
    case "$US_AUDIO" in
      http://*|https://*)
        US_AUDIO_URL="$US_AUDIO"
        ;;
      *)
        US_AUDIO_URL="${BASE_URL}${US_AUDIO}"
        ;;
    esac
  fi

  JSON_ARRAY="${JSON_ARRAY}{\"region\":\"US\",\"ipa\":\"$US_IPA\",\"audioUrl\":\"$US_AUDIO_URL\"}"
  ITEMS_ADDED=$((ITEMS_ADDED + 1))
fi

JSON_ARRAY="${JSON_ARRAY}]"

if [ $ITEMS_ADDED -eq 0 ]; then
  echo "❌ No pronunciation information found" >&2
  exit 1
fi

echo "" >&2
echo "📋 Results:" >&2
echo "$JSON_ARRAY"