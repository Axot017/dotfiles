#!/bin/bash
# Weather script for waybar using OpenWeatherMap API
# Requires: curl, jq, sops

# Location: Katowice, Poland
LAT="50.281760"
LON="18.997510"

# Get API key from sops-encrypted secrets
SECRETS_FILE="$HOME/.config/sops/secrets.yaml"

if [ -f "$SECRETS_FILE" ]; then
    API_KEY=$(sops -d "$SECRETS_FILE" 2>/dev/null | grep "openweather_api_key:" | awk '{print $2}')
fi

if [ -z "$API_KEY" ]; then
    echo '{"text": "??", "tooltip": "No API key"}'
    exit 0
fi

# Fetch weather data
URL="https://api.openweathermap.org/data/2.5/weather?lat=$LAT&lon=$LON&appid=$API_KEY&units=metric"
RESPONSE=$(curl -sf "$URL" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
    echo '{"text": "??", "tooltip": "Failed to fetch weather"}'
    exit 0
fi

# Parse response
TEMP=$(echo "$RESPONSE" | jq -r '.main.temp // empty' | awk '{printf "%.0f", $1}')
ICON_CODE=$(echo "$RESPONSE" | jq -r '.weather[0].icon // empty')
DESC=$(echo "$RESPONSE" | jq -r '.weather[0].description // empty')
CITY=$(echo "$RESPONSE" | jq -r '.name // empty')

if [ -z "$TEMP" ] || [ -z "$ICON_CODE" ]; then
    echo '{"text": "??", "tooltip": "Parse error"}'
    exit 0
fi

# Map weather icon codes to nerd font icons
case "$ICON_CODE" in
    01d|01n) ICON="󰖙" ;;  # clear sky
    02d|02n) ICON="󰖕" ;;  # few clouds
    03d|03n) ICON="󰖐" ;;  # scattered clouds
    04d|04n) ICON="󰖐" ;;  # broken clouds
    09d|09n) ICON="󰖗" ;;  # shower rain
    10d|10n) ICON="󰼳" ;;  # rain
    11d|11n) ICON="󰙾" ;;  # thunderstorm
    13d|13n) ICON="󰖘" ;;  # snow
    50d|50n) ICON="󰖑" ;;  # mist
    *) ICON="" ;;
esac

# Output JSON for waybar
echo "{\"text\": \"${TEMP}°C $ICON\", \"tooltip\": \"$DESC in $CITY\"}"
