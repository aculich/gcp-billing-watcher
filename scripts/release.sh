#!/bin/bash

# Release automation script
# Usage: ./scripts/release.sh [patch|minor|major] "Release message"

set -e

VERSION_TYPE=${1:-patch}
MESSAGE=${2:-"Update"}

if [ -z "$VSCE_PAT" ]; then
  echo "Error: VSCE_PAT environment variable is not set."
  exit 1
fi

echo "--- Starting release process: $VERSION_TYPE ---"

echo "--- Bumping version ($VERSION_TYPE) ---"
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
echo "New version: $NEW_VERSION"

echo "--- Building ---"
npm run compile

echo "--- Creating VSIX ---"
mkdir -p release
VSIX_FILE="release/gcp-billing-watcher-${NEW_VERSION#v}.vsix"
npx @vscode/vsce package --out "$VSIX_FILE"

echo "--- Pushing to GitHub ---"
git add .
git commit -m "chore: release $NEW_VERSION - $MESSAGE"
git tag "$NEW_VERSION"
git push origin main --tags

echo "--- Creating GitHub release ---"
gh release create "$NEW_VERSION" "$VSIX_FILE" --title "$NEW_VERSION" --notes "$MESSAGE"

echo "--- Publishing to Marketplace ---"
npx @vscode/vsce publish --pat "$VSCE_PAT"

echo "--- Release completed: $NEW_VERSION ---"
