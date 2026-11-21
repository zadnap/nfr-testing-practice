
#!/bin/bash

set -euo pipefail

# ==================================
# Configuration
# ==================================

BASE_URL="${BASE_URL:-http://localhost:8080}"
DATA_FILE="$(cd "$(dirname "$0")/.." && pwd)/data/products.json"

CREATE_API="$BASE_URL/api/v2/private/product"

# ==================================
# Check dependencies
# ==================================

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required."
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required."
    exit 1
fi

if [[ -z "${SHOPIZER_TOKEN:-}" ]]; then
    echo "Error: SHOPIZER_TOKEN is not set."
    echo "Please export SHOPIZER_TOKEN before running this script."
    exit 1
fi

if [[ ! -f "$DATA_FILE" ]]; then
    echo "Error: Cannot find $DATA_FILE"
    exit 1
fi

# ==================================
# Read configuration from JSON
# ==================================

STORE=$(jq -r '.store' "$DATA_FILE")
LANGUAGE=$(jq -r '.lang' "$DATA_FILE")
CATEGORY=$(jq -r '.category' "$DATA_FILE")

TOTAL=$(jq '.products | length' "$DATA_FILE")

echo "=================================="
echo " Shopizer Product Seeder"
echo "=================================="
echo "Store: $STORE"
echo "Language: $LANGUAGE"
echo "Total products: $TOTAL"
echo "=================================="

# ==================================
# Initialize counters and temp files
# ==================================

SUCCESS=0
FAILED=0

RESPONSE_FILE=$(mktemp)
PRODUCTS_FILE=$(mktemp)

cleanup() {
    rm -f "$RESPONSE_FILE" "$PRODUCTS_FILE"
}

trap cleanup EXIT

# Convert products into one JSON object per line
jq -c '.products[]' "$DATA_FILE" > "$PRODUCTS_FILE"

# ==================================
# Process each product
# ==================================

while IFS= read -r product || [[ -n "$product" ]]; do

    NAME=$(echo "$product" | jq -r '.name')
    SKU=$(echo "$product" | jq -r '.sku')
    PRICE=$(echo "$product" | jq -r '.price')
    SORT_ORDER=$(echo "$product" | jq -r '.sortOrder')

    FRIENDLY_URL=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

    echo ""
    echo "Creating: $NAME ($SKU)"

    # Build request payload
    PAYLOAD=$(jq -n \
        --arg name "$NAME" \
        --arg sku "$SKU" \
        --arg friendlyUrl "$FRIENDLY_URL" \
        --arg lang "$LANGUAGE" \
        --arg category "$CATEGORY" \
        --argjson price "$PRICE" \
        --argjson sortOrder "$SORT_ORDER" \
        '{
            canBePurchased: true,
            price: $price,
            quantity: 1000,
            descriptions: [
                {
                    name: $name,
                    description: $name,
                    title: $name,
                    friendlyUrl: $friendlyUrl,
                    language: $lang
                }
            ],
            identifier: $sku,
            productSpecifications: {
                height: 32,
                weight: 4,
                length: 22,
                width: 44
            },
            categories: [
                {
                    code: $category
                }
            ],
            shipeable: true,
            sortOrder: $sortOrder,
            type: "GENERAL",
            virtual: false,
            visible: true
        }'
    )

    # Send POST request
    HTTP_STATUS=$(curl -sS \
        -o "$RESPONSE_FILE" \
        -w "%{http_code}" \
        -X POST "$CREATE_API?lang=$LANGUAGE&store=$STORE" \
        -H "Authorization: Bearer $SHOPIZER_TOKEN" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "$PAYLOAD")

    # Check response status
    if [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
        echo "SUCCESS: $SKU (HTTP $HTTP_STATUS)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "FAILED: $SKU (HTTP $HTTP_STATUS)"
        cat "$RESPONSE_FILE"
        echo ""
        FAILED=$((FAILED + 1))
    fi

done < "$PRODUCTS_FILE"

# ==================================
# Seeding Summary
# ==================================

echo ""
echo "=================================="
echo " Seeding Summary"
echo "=================================="
echo "Total:   $TOTAL"
echo "Success: $SUCCESS"
echo "Failed:  $FAILED"
echo "=================================="

if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi

echo "All products created successfully!"
