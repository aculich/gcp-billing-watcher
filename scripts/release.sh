#!/bin/bash

# JA: リリース自動化スクリプト
# EN: Release automation script
# JA: 使用方法: ./scripts/release.sh [patch|minor|major] "Release message"
# EN: Usage:   ./scripts/release.sh [patch|minor|major] "Release message"

set -e

VERSION_TYPE=${1:-patch}
MESSAGE=${2:-"Update"}

if [ -z "$VSCE_PAT" ]; then
  echo "Error: VSCE_PAT environment variable is not set."
  exit 1
fi

# JA: 1. リリースプロセスを開始
echo "--- Starting release process: $VERSION_TYPE ---"

# JA: 2. バージョンアップ
echo "--- Bumping version ($VERSION_TYPE) ---"
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
echo "New version: $NEW_VERSION"

# JA: 3. ビルド
echo "--- Building ---"
npm run compile

# JA: 4. パッケージング（VSIX を作成）
echo "--- Creating VSIX ---"
mkdir -p release
VSIX_FILE="release/gcp-billing-watcher-${NEW_VERSION#v}.vsix"
npx @vscode/vsce package --out "$VSIX_FILE"

# JA: 5. GitHub へのプッシュとタグ付け
echo "--- Pushing to GitHub ---"
git add .
git commit -m "chore: release $NEW_VERSION - $MESSAGE"
git tag "$NEW_VERSION"
git push origin main --tags

# JA: 6. GitHub リリースページ作成
echo "--- Creating GitHub release ---"
gh release create "$NEW_VERSION" "$VSIX_FILE" --title "$NEW_VERSION" --notes "$MESSAGE"

# JA: 7. Marketplace への公開
echo "--- Publishing to Marketplace ---"
npx @vscode/vsce publish --pat "$VSCE_PAT"

echo "--- Release completed: $NEW_VERSION ---"
