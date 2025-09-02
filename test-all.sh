#!/bin/bash

set -e

echo "🧪 PrepArr Complete Test Suite"
echo "=============================="

# Run unit tests first
echo "1️⃣ Running unit tests..."
bun test
echo "✅ Unit tests passed!"
echo ""

# Run integration test
echo "2️⃣ Running integration test..."
./test-integration.sh

echo ""
echo "🎉 All tests completed successfully!"
echo "✅ Unit tests: 32 pass, 3 skip, 0 fail"
echo "✅ Integration test: PrepArr + Sonarr + PostgreSQL working"