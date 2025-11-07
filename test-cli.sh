#!/bin/bash
# Test script for Vargos CLI
# Run: ./test-cli.sh

echo "================================"
echo "Vargos CLI Test Script"
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo ""
    echo "Please create one:"
    echo "  cp .env.test .env"
    echo "  nano .env  # Add your API keys"
    echo ""
    exit 1
fi

echo "✓ .env file found"
echo ""

# Test 1: Basic chat
echo "Test 1: Basic chat mode"
echo "------------------------"
echo "This will start an interactive chat session."
echo "Try these commands:"
echo "  - 'What tools do you have?'"
echo "  - 'Read the README.md file'"
echo "  - 'Spawn a subagent to list all files'"
echo ""
echo "Running: pnpm cli chat"
echo ""

pnpm cli chat

# Note: This will block until user exits
# For automated testing, we'd use 'run' command instead