#!/bin/bash

# Build script for Alfred Translate to Notion workflow

# Exit on error
set -e

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

echo "Building Alfred Translate to Notion workflow v$VERSION..."

# Remove old workflow files
echo "Cleaning old workflow files..."
rm -f alfred-translate-notion-v*.alfredworkflow

# Create a temporary directory
BUILD_DIR="./build"
WORKFLOW_NAME="alfred-translate-notion-v${VERSION}.alfredworkflow"

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy necessary files
echo "Copying files..."
cp info.plist "$BUILD_DIR/"
cp icon.png "$BUILD_DIR/" 2>/dev/null || echo "Warning: icon.png not found"
cp tts.png "$BUILD_DIR/" 2>/dev/null || echo "Warning: tts.png not found"
cp index.js "$BUILD_DIR/"
cp token.js "$BUILD_DIR/"
cp translate.js "$BUILD_DIR/"
cp tts.js "$BUILD_DIR/"
cp languages.js "$BUILD_DIR/"
cp config.example.json "$BUILD_DIR/"
cp package.json "$BUILD_DIR/"
cp -r helpers "$BUILD_DIR/"
cp -r scripts "$BUILD_DIR/"
cp -r node_modules "$BUILD_DIR/"

# Create the workflow file (it's just a zip with .alfredworkflow extension)
echo "Creating workflow package..."
cd "$BUILD_DIR"
zip -r "../$WORKFLOW_NAME" ./* -q

cd ..
rm -rf "$BUILD_DIR"

echo "✅ Successfully created: $WORKFLOW_NAME"
echo "You can now share or install this workflow file."
