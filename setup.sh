#!/bin/bash
#
# JA: Google Cloud Billing Watcher - セットアップスクリプト
# EN: Google Cloud Billing Watcher - Setup script
#
# JA: このスクリプトは以下を自動で実行します：
# EN: This script:
#   1. Checks that gcloud CLI is installed
#   2. Verifies Application Default Credentials
#   3. Creates the BigQuery dataset
#   4. Guides you through the remaining steps in Google Cloud Console
#
# Usage / 使い方:
#   ./setup.sh <project-id> [dataset-name] [location]
#
# Examples / 例:
#   ./setup.sh my-project
#   ./setup.sh my-project billing_export asia-northeast1
#
# JA: 引数: project-id（必須）, dataset-name（デフォルト: billing_export）, location（デフォルト: US）
# EN: Arguments: project-id (required), dataset-name (default: billing_export), location (default: US)
#

# JA: エラーが発生したらスクリプトを終了する
set -e

# JA: 色の定義（ターミナル出力を見やすくするため）
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# JA: ヘルパー関数（メッセージ表示用）
info()    { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
error()   { echo -e "${RED}❌ $1${NC}"; }

# JA: ヘッダー表示
echo ""
echo "========================================"
echo "  Google Cloud Billing Watcher Setup"
echo "========================================"
echo ""

# JA: 第1引数（プロジェクトID）が指定されていない場合は使い方を表示して終了
if [ -z "$1" ]; then
    echo "Usage: $0 <project-id> [dataset-name] [location]"
    echo ""
    echo "Arguments:"
    echo "  project-id   : Google Cloud project ID (required)"
    echo "  dataset-name : Dataset name (default: billing_export)"
    echo "  location     : Location (default: US)"
    echo ""
    echo "Examples:"
    echo "  $0 my-project"
    echo "  $0 my-project billing_export asia-northeast1"
    echo ""
    exit 1
fi

# JA: 引数を変数に格納（デフォルト値を設定）
PROJECT_ID="$1"
DATASET_NAME="${2:-billing_export}"
LOCATION="${3:-US}"

# JA: 設定内容を表示
echo "📋 Settings:"
echo "   Project ID  : $PROJECT_ID"
echo "   Dataset     : $DATASET_NAME"
echo "   Location    : $LOCATION"
echo ""

# JA: Step 1: gcloud CLI の確認（Google Cloud SDK がインストールされているかチェック）
info "Step 1/4: Checking gcloud CLI..."

# JA: gcloud コマンドが存在するかチェック
if ! command -v gcloud &> /dev/null; then
    error "gcloud command not found"
    echo ""
    echo "Please install the Google Cloud SDK:"
    echo ""
    echo "  Mac (Homebrew):"
    echo "    brew install --cask google-cloud-sdk"
    echo ""
    echo "  Other:"
    echo "    https://cloud.google.com/sdk/docs/install"
    echo ""
    exit 1
fi

# JA: バージョンを表示
GCLOUD_VERSION=$(gcloud --version | head -n 1)
success "gcloud CLI: $GCLOUD_VERSION"

# JA: Step 2: 認証状態の確認（Application Default Credentials が設定されているか）
info "Step 2/4: Checking authentication..."

# JA: 環境変数 GOOGLE_APPLICATION_CREDENTIALS が設定されていればそれを使用、未設定ならデフォルトのパスを使用
ADC_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"

# JA: ADC ファイルが存在するかチェック
if [ -f "$ADC_PATH" ]; then
    success "Application Default Credentials are set"
else
    warn "Application Default Credentials not found"
    echo ""
    # JA: ADC とは？ ローカル環境から Google Cloud に接続するための認証情報。VS Code 拡張機能が BigQuery からデータを取得するために必要。
    echo "💡 What is ADC?"
    echo "   Credentials for connecting to Google Cloud from your machine."
    echo "   Required for the VS Code extension to read data from BigQuery."
    echo ""
    
    # JA: ユーザーに認証を行うか確認
    read -p "Authenticate now? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # JA: ブラウザで認証を行います。ブラウザが開いたら Google アカウントでログインしてください
        info "Opening browser for authentication..."
        echo "   → Sign in with your Google account when the browser opens"
        echo ""
        
        gcloud auth application-default login
        
        if [ $? -eq 0 ]; then
            success "Authentication complete"
        else
            error "Authentication failed"
            exit 1
        fi
    else
        # JA: 認証をスキップしました。後で gcloud auth application-default login を実行してください
        warn "Skipped authentication"
        echo ""
        echo "Run this later when ready:"
        echo "  gcloud auth application-default login"
        echo ""
    fi
fi

# JA: Step 3: BigQuery データセットの作成（課金データを保存するためのデータセットを作成）
info "Step 3/4: Creating BigQuery dataset..."

# JA: bq コマンド（BigQuery CLI）が存在するかチェック。bq は gcloud CLI に含まれている
if ! command -v bq &> /dev/null; then
    error "bq command not found"
    echo ""
    echo "bq is included in the Google Cloud SDK."
    echo "Please reinstall the gcloud CLI."
    exit 1
fi

# JA: データセットが既に存在するか確認。存在する場合は作成をスキップ
if bq --project_id="$PROJECT_ID" show "$DATASET_NAME" &> /dev/null; then
    success "Dataset '$DATASET_NAME' already exists"
else
    # JA: データセットを新規作成（--dataset, --location, --description）
    bq --project_id="$PROJECT_ID" mk \
        --dataset \
        --location="$LOCATION" \
        --description="Google Cloud Billing Export - billing data export" \
        "$DATASET_NAME"
    
    if [ $? -eq 0 ]; then
        success "Created dataset '$DATASET_NAME'"
    else
        error "Failed to create dataset"
        echo ""
        # JA: 考えられる原因: プロジェクト ID が間違っている、BigQuery API が有効化されていない、権限が不足している
        echo "Possible causes:"
        echo "  - Invalid project ID"
        echo "  - BigQuery API not enabled"
        echo "  - Insufficient permissions"
        exit 1
    fi
fi

# JA: Step 4: 次のステップの案内（Google Cloud コンソールでの手動設定が必要）
echo ""
echo "========================================"
info "Step 4/4: Remaining steps (manual)"
echo "========================================"
echo ""
# JA: 課金エクスポートの有効化は Google Cloud コンソールで行う必要があります
warn "⚡ Billing export must be enabled in Google Cloud Console"
echo ""
# JA: 1. URL にアクセス 2. 左メニューで「請求先アカウント」を選択 3. 「標準の使用料金」→「設定を編集」 4. プロジェクト・データセットを設定 5. 「保存」
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ 1. Open:                                                     │"
echo "│    ${BLUE}https://console.cloud.google.com/billing/export${NC}         │"
echo "│                                                             │"
echo "│ 2. Select \"Billing account\" in the left menu                │"
echo "│                                                             │"
echo "│ 3. Click \"Standard usage cost\" → \"Edit settings\"            │"
echo "│                                                             │"
echo "│ 4. Set:                                                      │"
echo "│    - Project: ${GREEN}$PROJECT_ID${NC}"
echo "│    - Dataset: ${GREEN}$DATASET_NAME${NC}"
echo "│                                                             │"
echo "│ 5. Click \"Save\"                                               │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""

# JA: 完了メッセージ
echo "========================================"
success "Setup complete!"
echo "========================================"
echo ""
# JA: 次のステップ: 課金エクスポートを有効化、VS Code 拡張機能をインストール、gcpBilling.projectId を設定
echo "📝 Next steps:"
echo ""
echo "   1. Enable billing export in Google Cloud Console (above)"
echo "      (Data may take 24–48 hours to appear)"
echo ""
echo "   2. Install the VS Code extension:"
echo "      Cmd + Shift + P → 'Extensions: Install from VSIX...'"
echo ""
echo "   3. Set the project ID in VS Code settings:"
echo "      gcpBilling.projectId = \"$PROJECT_ID\""
echo ""
