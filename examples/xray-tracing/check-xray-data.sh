#!/bin/bash

echo " Checking X-Ray trace data..."
echo "Region: us-east-1"
echo "Time range: Last 30 minutes"
echo ""

# Get current time and 30 minutes ago in epoch format
END_TIME=$(date +%s)
START_TIME=$((END_TIME - 1800))  # 30 minutes ago

echo "Checking for traces between:"
echo "  Start: $(date -d @$START_TIME)"
echo "  End:   $(date -d @$END_TIME)"
echo ""

# Check if we can get trace summaries
echo "=== TRACE SUMMARY ==="
aws xray get-trace-summaries \
    --region us-east-1 \
    --time-range-type TimeRangeByStartTime \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --query 'TraceSummaries[0:10].{Id:Id,Duration:Duration,ResponseTime:ResponseTime,HasError:HasError,HasFault:HasFault}' \
    2>/dev/null || echo "Unable to fetch trace summaries (may need AWS CLI configuration or permissions)"

echo ""

# Check service statistics
echo "=== SERVICE STATISTICS ==="
aws xray get-service-graph \
    --region us-east-1 \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --query 'Services[].{Name:Name,State:State,ResponseTimeHistogram:ResponseTimeHistogram.TotalCount}' \
    2>/dev/null || echo "Unable to fetch service graph (may need AWS CLI configuration or permissions)"

echo ""

# List recent Lambda invocations to verify activity
echo "=== LAMBDA FUNCTION ACTIVITY ==="
functions=("dev-traced-api-get-health" "dev-traced-api-get-users" "dev-traced-api-post-users" "dev-traced-api-get-error" "dev-data-processor")

for func in "${functions[@]}"; do
    echo "Function: $func"
    
    # Get function metrics (if available)
    aws logs describe-log-groups \
        --region us-east-1 \
        --log-group-name-prefix "/aws/lambda/$func" \
        --query 'logGroups[0].{LogGroup:logGroupName,StoredBytes:storedBytes,LastEvent:lastEventTime}' \
        2>/dev/null || echo "  Log group not accessible"
    
    echo ""
done

echo "=== X-RAY CONSOLE LINKS ==="
echo " Direct links to view traces:"
echo ""
echo "1. Service Map:"
echo "   https://console.aws.amazon.com/xray/home?region=us-east-1#/service-map"
echo ""
echo "2. Traces (last 30 minutes):"
echo "   https://console.aws.amazon.com/xray/home?region=us-east-1#/traces"
echo ""
echo "3. Analytics:"
echo "   https://console.aws.amazon.com/xray/home?region=us-east-1#/analytics"
echo ""

echo "=== EXPECTED TRACE PATTERNS ==="
echo ""
echo " What to look for in X-Ray Console:"
echo ""
echo "1. SERVICE MAP should show:"
echo "   - API Gateway (if tracing enabled)"
echo "   - Lambda functions: dev-traced-api-*"
echo "   - Connections between services"
echo ""
echo "2. TRACES should show:"
echo "   - ~188 traces from our test run"
echo "   - Response times: 100-300ms (with simulated delays)"
echo "   - Error traces from /error endpoint"
echo "   - Cold start patterns for first invocations"
echo ""
echo "3. PERFORMANCE INSIGHTS:"
echo "   - Health endpoint: fastest (~100ms)"
echo "   - Users endpoint: medium (~200ms with 100ms delay)"
echo "   - POST users: slowest (~225ms with 50ms+75ms delays)"
echo "   - Error endpoint: varies (exception handling time)"
echo ""
echo "4. ERROR ANALYSIS:"
echo "   - ~18 error traces from /error endpoint"
echo "   - Exception details and stack traces"
echo "   - Error rate percentages"
echo ""

echo " X-Ray data check complete!"
echo ""
echo " Tips for X-Ray Console:"
echo "   - Use time filters to focus on recent traces"
echo "   - Click on individual traces for detailed timing"
echo "   - Use service map to understand dependencies"
echo "   - Check analytics for performance trends"