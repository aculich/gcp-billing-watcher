#!/bin/bash
#
# JA: Google Cloud Billing Watcher - セットアップスクリプト
# EN: Google Cloud Billing Watcher - Setup script
#
# JA: このスクリプトは以下を自動で実行します：
# EN: This script:
#   1. Checks that gcloud CLI is installed
#   2. Verifies Application Default Credentials
#   3. Checks required APIs (BigQuery) and offers to enable them if disabled
#   4. Creates the BigQuery dataset
#   5. Guides you through the remaining steps in Google Cloud Console
#
# Usage / 使い方:
#   ./setup.sh [--write-workspace-config] <project-id> [dataset-name] [location]
#
# Examples / 例:
#   ./setup.sh my-project
#   ./setup.sh my-project billing_export asia-northeast1
#   ./setup.sh --write-workspace-config my-project
#
# JA: 引数: --write-workspace-config（任意）, project-id（必須）, dataset-name（デフォルト: billing_export）, location（デフォルト: US）
# EN: Arguments: --write-workspace-config (optional), project-id (required), dataset-name (default: billing_export), location (default: US)
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

# JA: タイムアウト付きでコマンドを実行（bq がハングするのを防ぐ）
# EN: Run a command with a timeout to avoid hanging (e.g. bq can hang on slow/first connection).
# Always redirect stdin from /dev/null so bq (or any command) never blocks on input when run from a script.
# Returns 124 if the command was killed after timeout_sec (SIGTERM -> wait returns 143).
run_with_timeout() {
    local timeout_sec="$1"
    shift
    "$@" < /dev/null &
    local pid=$!
    ( sleep "$timeout_sec"; kill $pid 2>/dev/null ) &
    local killer=$!
    wait $pid 2>/dev/null
    local ret=$?
    kill $killer 2>/dev/null
    wait $killer 2>/dev/null
    # 143 = 128+15 (SIGTERM) when our killer terminated the process
    [ $ret -eq 143 ] && return 124
    return $ret
}

# JA: ヘッダー表示
echo ""
echo "========================================"
echo "  Google Cloud Billing Watcher Setup"
echo "========================================"
echo ""

# JA: --write-workspace-config オプションの処理（任意）
WRITE_WORKSPACE_CONFIG=""
if [ "$1" = "--write-workspace-config" ]; then
    WRITE_WORKSPACE_CONFIG="1"
    shift
fi

# JA: 第1引数（プロジェクトID）が指定されていない場合は使い方を表示して終了
if [ -z "$1" ]; then
    echo "Usage: $0 [--write-workspace-config] <project-id> [dataset-name] [location]"
    echo ""
    echo "Arguments:"
    echo "  --write-workspace-config : Write gcpBilling.projectId (and datasetId) to .vscode/settings.json in the current directory (optional)"
    echo "  project-id   : Google Cloud project ID (required)"
    echo "  dataset-name : Dataset name (default: billing_export)"
    echo "  location     : Location (default: US)"
    echo ""
    echo "Examples:"
    echo "  $0 my-project"
    echo "  $0 my-project billing_export asia-northeast1"
    echo "  $0 --write-workspace-config my-project"
    echo ""
    exit 1
fi

# JA: 引数を変数に格納（デフォルト値を設定）
PROJECT_ID="$1"
DATASET_NAME="${2:-billing_export}"
LOCATION="${3:-US}"

# JA: bq コマンドのタイムアウト（秒）。ハング防止。環境で遅い場合は BQ_TIMEOUT=120 などで上書き可能。
# EN: Timeout for bq commands (seconds). Override for slow environments: BQ_TIMEOUT=120 ./setup.sh ...
BQ_TIMEOUT="${BQ_TIMEOUT:-60}"

# JA: 設定内容を表示
echo "📋 Settings:"
echo "   Project ID  : $PROJECT_ID"
echo "   Dataset     : $DATASET_NAME"
echo "   Location    : $LOCATION"
echo ""
echo "This script will:"
echo "  1. Check gcloud CLI and Application Default Credentials (for the VS Code extension)"
echo "  2. Check if the BigQuery API is enabled for this project; offer to enable it if not"
echo "  3. Create the BigQuery dataset (or confirm it already exists)"
echo "  4. Show you how to enable billing export in Cloud Console and set the extension project"
echo ""

# JA: Step 1: gcloud CLI の確認（Google Cloud SDK がインストールされているかチェック）
info "Step 1/5: Checking gcloud CLI..."

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
info "Step 2/5: Checking authentication (Application Default Credentials)..."

# JA: 環境変数 GOOGLE_APPLICATION_CREDENTIALS が設定されていればそれを使用、未設定ならデフォルトのパスを使用
ADC_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"

# JA: ADC ファイルが存在するかチェック
echo "   → Looking for credentials at: $ADC_PATH"
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
        echo "   Running: gcloud auth application-default login"
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

# JA: Step 3: 必要な API（BigQuery）の有効化確認と有効化
# EN: Step 3: Check required APIs (BigQuery) and offer to enable if disabled
info "Step 3/5: Checking required APIs for this project..."
echo "   → The extension needs the BigQuery API to create the dataset and to read billing export data."
echo ""

BIGQUERY_API="bigquery.googleapis.com"
# JA: プロジェクトで BigQuery API が有効かどうかを確認
ENABLED=$(gcloud services list --enabled --project="$PROJECT_ID" --filter="config.name:$BIGQUERY_API" --format="value(config.name)" 2>/dev/null || true)
if [ "$ENABLED" = "$BIGQUERY_API" ]; then
    success "BigQuery API is already enabled for project $PROJECT_ID"
else
    warn "BigQuery API is not enabled for project $PROJECT_ID"
    echo ""
    echo "   The BigQuery API must be enabled so this script can create the dataset"
    echo "   and the VS Code extension can query billing data."
    echo ""
    echo "   Enabling the API is free (you only pay for BigQuery usage, e.g. billing export storage)."
    echo "   First-time enablement can take 1–2 minutes to complete."
    echo ""
    read -p "Enable BigQuery API for project $PROJECT_ID now? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Enabling BigQuery API (this may take 1–2 minutes on first enable)..."
        echo "   Running: gcloud services enable $BIGQUERY_API --project=$PROJECT_ID"
        if gcloud services enable "$BIGQUERY_API" --project="$PROJECT_ID"; then
            success "BigQuery API enabled successfully"
            echo "   → Waiting a few seconds for the API to be ready..."
            sleep 5
        else
            error "Failed to enable BigQuery API"
            echo ""
            echo "   You may need to enable it manually:"
            echo "   https://console.cloud.google.com/apis/library/bigquery.googleapis.com?project=$PROJECT_ID"
            echo ""
            exit 1
        fi
    else
        warn "Skipped enabling BigQuery API"
        echo ""
        echo "   Enable it manually, then re-run this script:"
        echo "   https://console.cloud.google.com/apis/library/bigquery.googleapis.com?project=$PROJECT_ID"
        echo "   Or run: gcloud services enable $BIGQUERY_API --project=$PROJECT_ID"
        echo ""
        exit 1
    fi
fi
echo ""

# JA: Step 4: BigQuery データセットの作成（課金データを保存するためのデータセットを作成）
# EN: Step 4: Create BigQuery dataset
info "Step 4/5: Creating BigQuery dataset..."
echo "   → Creating the dataset allows billing export data to be stored here; the extension will query this dataset."
echo ""

# JA: bq コマンド（BigQuery CLI）が存在するかチェック。bq は gcloud CLI に含まれている
if ! command -v bq &> /dev/null; then
    error "bq command not found"
    echo ""
    echo "bq is included in the Google Cloud SDK."
    echo "Please reinstall the gcloud CLI."
    exit 1
fi

# JA: データセットが既に存在するか確認。存在する場合は作成をスキップ（タイムアウト付き）
# EN: bq reference: "bq ls" = list datasets in project; "bq show <id>" = show project (no arg) or dataset (name); "bq mk --dataset ..." = create dataset
info "   Listing existing datasets in project $PROJECT_ID (bq ls)..."
BQ_LS_OUTPUT=$(run_with_timeout "$BQ_TIMEOUT" bq --project_id="$PROJECT_ID" ls --format=pretty 2>&1)
BQ_LS_EXIT=$?
if [ $BQ_LS_EXIT -eq 0 ] && [ -n "$BQ_LS_OUTPUT" ]; then
    echo "$BQ_LS_OUTPUT" | sed 's/^/   /'
else
    echo "   (none or list timed out)"
fi
echo ""
info "   Checking if dataset '$DATASET_NAME' already exists (bq show $DATASET_NAME)..."
info "   (Timeout: ${BQ_TIMEOUT}s — if this hangs, the script will stop and show next steps)"
echo ""
echo "   Command: bq --project_id=$PROJECT_ID show $DATASET_NAME"
echo ""
BQ_SHOW_OUTPUT=$(run_with_timeout "$BQ_TIMEOUT" bq --project_id="$PROJECT_ID" show "$DATASET_NAME" 2>&1)
BQ_SHOW_EXIT=$?
# 124 = our timeout return code; 143 = 128+SIGTERM (process killed by timeout) on some systems
if [ $BQ_SHOW_EXIT -eq 124 ] || [ $BQ_SHOW_EXIT -eq 143 ]; then
    error "The 'bq show' command timed out after ${BQ_TIMEOUT} seconds"
    echo ""
    echo "   Why: 'bq info' works (it only reads local config), but 'bq show' and 'bq mk' call the"
    echo "   BigQuery API. If those hang, the API may be slow, blocked (firewall/proxy), or affected"
    echo "   by an incident. Check https://status.cloud.google.com and try again later or from another network."
    echo ""
    echo "   To see where bq hangs, run with debug: CLOUDSDK_CORE_LOG_LEVEL=debug bq --project_id=$PROJECT_ID show $DATASET_NAME"
    echo ""
    echo "========================================"
    echo "  Next steps (run these yourself)"
    echo "========================================"
    echo ""
    echo "  1. Check if the dataset exists (may hang if BigQuery is slow; use Ctrl+C and skip to step 2):"
    echo "     bq --project_id=$PROJECT_ID show $DATASET_NAME"
    echo ""
    echo "  2. If it does not exist, create the dataset:"
    echo "     bq --project_id=$PROJECT_ID mk --dataset --location=$LOCATION $DATASET_NAME"
    echo ""
    echo "  3. Then re-run this script to continue, or complete setup in Cloud Console (billing export)."
    echo ""
    exit 1
fi
if [ $BQ_SHOW_EXIT -eq 0 ]; then
    success "Dataset '$DATASET_NAME' already exists"
else
    # Dataset does not exist (or other error); show bq output and try to create
    echo "$BQ_SHOW_OUTPUT" | sed 's/^/   /'
    info "   Dataset does not exist. Creating '$DATASET_NAME' (usually a few seconds)..."
    echo ""
    echo "   Command we're running (you can run this yourself to test or adjust params):"
    echo "   bq --project_id=$PROJECT_ID mk --dataset --location=$LOCATION --description=\"...\" $DATASET_NAME"
    echo "   (Full: bq --project_id=$PROJECT_ID mk --dataset --location=$LOCATION --description=\"Google Cloud Billing Export - billing data export\" $DATASET_NAME)"
    echo ""
    if run_with_timeout "$BQ_TIMEOUT" sh -c "bq --project_id=$PROJECT_ID mk --dataset --location=$LOCATION --description='Google Cloud Billing Export - billing data export' $DATASET_NAME"; then
        success "Created dataset '$DATASET_NAME'"
    else
        BQ_MK_EXIT=$?
        if [ $BQ_MK_EXIT -eq 124 ] || [ $BQ_MK_EXIT -eq 143 ]; then
            error "The 'bq mk' command timed out after ${BQ_TIMEOUT} seconds"
            echo ""
            echo "   Why: 'bq info' works (local only), but 'bq mk' calls the BigQuery API. If it hangs,"
            echo "   check https://status.cloud.google.com and try again later or from another network."
            echo ""
        else
            error "Failed to create dataset"
        fi
        echo ""
        echo "========================================"
        echo "  Next steps (run these yourself)"
        echo "========================================"
        echo ""
        echo "  Create the dataset manually (you can change location/dataset name if needed):"
        echo "  bq --project_id=$PROJECT_ID mk --dataset --location=$LOCATION $DATASET_NAME"
        echo ""
        echo "  Or with full description:"
        echo "  bq --project_id=$PROJECT_ID mk --dataset --location=$LOCATION --description=\"Google Cloud Billing Export - billing data export\" $DATASET_NAME"
        echo ""
        echo "  Then re-run this script to continue, or complete setup in Cloud Console (billing export)."
        echo ""
        if [ $BQ_MK_EXIT -ne 124 ] && [ $BQ_MK_EXIT -ne 143 ]; then
            echo "  Possible causes:"
            echo "  - Invalid project ID"
            echo "  - BigQuery API not enabled (re-run this script and choose to enable it in Step 3)"
            echo "  - Insufficient permissions (need BigQuery Data Editor or similar)"
            echo ""
        fi
        exit 1
    fi
fi
echo ""

# JA: Step 5: 次のステップの案内（Google Cloud コンソールでの手動設定が必要）
# EN: Step 5: Remaining steps (manual in Cloud Console)
echo "========================================"
info "Step 5/5: Remaining steps (manual)"
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
echo "      (Or run this script with --write-workspace-config from the repo root to write .vscode/settings.json for this workspace.)"
echo ""

# JA: オプション: このリポジトリの .vscode/settings.json に gcpBilling を書き込む
# EN: Optional: write gcpBilling to .vscode/settings.json in the current directory
if [ -n "$WRITE_WORKSPACE_CONFIG" ]; then
    VSCODE_DIR=".vscode"
    SETTINGS_FILE="$VSCODE_DIR/settings.json"
    if [ ! -d "$VSCODE_DIR" ]; then
        mkdir -p "$VSCODE_DIR"
        success "Created $VSCODE_DIR/"
    fi
    if [ ! -f "$SETTINGS_FILE" ]; then
        printf '{\n  "gcpBilling.projectId": "%s",\n  "gcpBilling.datasetId": "%s"\n}\n' "$PROJECT_ID" "$DATASET_NAME" > "$SETTINGS_FILE"
        success "Wrote gcpBilling.projectId and gcpBilling.datasetId to $SETTINGS_FILE"
    else
        if command -v jq &> /dev/null; then
            jq --arg pid "$PROJECT_ID" --arg did "$DATASET_NAME" \
                '. + {"gcpBilling.projectId": $pid, "gcpBilling.datasetId": $did}' \
                "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
            success "Updated gcpBilling.projectId and gcpBilling.datasetId in $SETTINGS_FILE"
        else
            warn "jq not found; could not merge into existing $SETTINGS_FILE"
            echo "   Add these lines to $SETTINGS_FILE (or install jq and re-run with --write-workspace-config):"
            echo "   \"gcpBilling.projectId\": \"$PROJECT_ID\","
            echo "   \"gcpBilling.datasetId\": \"$DATASET_NAME\""
            echo ""
        fi
    fi
fi
echo ""
