#!/bin/bash

# Test script for X-Ray tracing with real KV (DynamoDB) operations
API_URL="https://4xkwevdsy1.execute-api.us-east-1.amazonaws.com/dev"

echo " Testing X-Ray tracing with REAL KV (DynamoDB) operations..."
echo "This will generate traces showing DynamoDB GetItem/PutItem calls"
echo ""

# Function to test endpoint and show response
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=${3:-""}
    local description=$4
    
    echo "Testing: $description"
    echo "  $method $endpoint"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s "$API_URL$endpoint")
    fi
    
    echo "  Response: $(echo $response | jq -r '.message // .status // .count // "completed"' 2>/dev/null || echo "completed")"
    echo "  KV Ops: $(echo $response | jq -r '.kvOperations // "N/A"' 2>/dev/null)"
    echo "  Source: $(echo $response | jq -r '.source // "N/A"' 2>/dev/null)"
    echo ""
    sleep 1
}

echo "=== 1. HEALTH CHECK WITH KV PING ==="
echo "This will generate DynamoDB GetItem + PutItem traces"
test_endpoint "GET" "/health" "" "Health check with KV store ping"

echo "=== 2. FIRST USER FETCH (KV MISS) ==="
echo "First call will miss KV cache and create default data"
test_endpoint "GET" "/users" "" "Get users (will create default data in KV)"

echo "=== 3. SECOND USER FETCH (KV HIT) ==="
echo "Second call will hit KV cache and return stored data"
test_endpoint "GET" "/users" "" "Get users (should hit KV cache)"

echo "=== 4. USER CREATION WITH MULTIPLE KV OPERATIONS ==="
echo "Each user creation generates 3 DynamoDB operations"
test_endpoint "POST" "/users" '{"name": "Alice KV", "email": "alice@kv.com", "role": "admin"}' "Create user with multiple KV ops"
test_endpoint "POST" "/users" '{"name": "Bob KV", "email": "bob@kv.com", "role": "user"}' "Create user with multiple KV ops"
test_endpoint "POST" "/users" '{"name": "Carol KV", "email": "carol@kv.com", "role": "moderator"}' "Create user with multiple KV ops"

echo "=== 5. VERIFY USER LIST UPDATED ==="
echo "This should now show the created users from KV store"
test_endpoint "GET" "/users" "" "Get updated user list from KV"

echo "=== 6. STANDALONE FUNCTION WITH KV OPERATIONS ==="
echo "Invoking data processor with KV operations..."
for i in {1..3}; do
    echo "Processor invocation $i:"
    aws lambda invoke \
        --function-name dev-data-processor \
        --region us-east-1 \
        --payload "{\"test\": true, \"iteration\": $i}" \
        /tmp/processor-response-$i.json > /dev/null 2>&1
    
    if [ -f /tmp/processor-response-$i.json ]; then
        echo "  Response: $(cat /tmp/processor-response-$i.json | jq -r '.body' 2>/dev/null | jq -r '.message' 2>/dev/null || echo "completed")"
        echo "  KV Ops: $(cat /tmp/processor-response-$i.json | jq -r '.body' 2>/dev/null | jq -r '.kvOperations' 2>/dev/null || echo "N/A")"
        rm -f /tmp/processor-response-$i.json
    fi
    sleep 1
done
echo ""

echo "=== 7. ERROR WITH KV CONTEXT ==="
echo "This will generate DynamoDB trace before the error"
test_endpoint "GET" "/error" "" "Error endpoint with KV operation context"

echo "=== 8. CONCURRENT KV OPERATIONS ==="
echo "Testing concurrent requests to generate multiple DynamoDB traces"
echo "Making 5 concurrent health checks..."
for i in {1..5}; do
    curl -s "$API_URL/health" > /dev/null &
done
wait

echo "Making 5 concurrent user fetches..."
for i in {1..5}; do
    curl -s "$API_URL/users" > /dev/null &
done
wait

echo "Making 3 concurrent user creations..."
for i in {1..3}; do
    curl -s -X POST "$API_URL/users" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"Concurrent User $i\", \"email\": \"concurrent$i@example.com\"}" > /dev/null &
done
wait

echo ""
echo "✅ KV trace generation complete!"
echo ""
echo " Expected X-Ray Console Data:"
echo ""
echo "SERVICE MAP should now show:"
echo "  - Lambda functions (your API endpoints + data-processor)"
echo "  - DynamoDB (connected to all Lambda functions)"
echo "  - Service connections showing Lambda → DynamoDB"
echo ""
echo "TRACES should show DynamoDB operations:"
echo "  - GetItem operations (reading from KV)"
echo "  - PutItem operations (writing to KV)"
echo "  - Operation timing and latency"
echo "  - DynamoDB table name: dev-users"
echo ""
echo "SPECIFIC OPERATIONS TRACED:"
echo "  - Health checks: GetItem + PutItem (2 ops each)"
echo "  - User fetches: GetItem (1st miss) or GetItem (subsequent hits)"
echo "  - User creation: PutItem + GetItem + PutItem (3 ops each)"
echo "  - Data processor: GetItem + PutItem + PutItem (3 ops each)"
echo "  - Error endpoint: GetItem (before error)"
echo ""
echo "PERFORMANCE INSIGHTS:"
echo "  - DynamoDB operation latency (typically 1-5ms)"
echo "  - Cold start vs warm execution patterns"
echo "  - Concurrent DynamoDB access patterns"
echo ""
echo "Go to X-Ray Console to see the DynamoDB traces:"
echo "https://console.aws.amazon.com/xray/home?region=us-east-1#/service-map"
echo ""
echo "Expected total DynamoDB operations: ~50+ traces"