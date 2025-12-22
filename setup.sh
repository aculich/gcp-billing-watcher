#!/bin/bash
# GCP Billing Watcher - 統合セットアップスクリプト
# 認証確認 → データセット作成 → 次のステップ案内 をワンストップで実行
#
# 使い方: ./setup.sh <project-id> [dataset-name] [location]

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ヘルパー関数
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

# ヘッダー表示
echo ""
echo "========================================"
echo "  GCP Billing Watcher セットアップ"
echo "========================================"
echo ""

# 引数チェック
if [ -z "$1" ]; then
    echo "使い方: $0 <project-id> [dataset-name] [location]"
    echo ""
    echo "  project-id   : GCP プロジェクト ID（必須）"
    echo "  dataset-name : データセット名（デフォルト: billing_export）"
    echo "  location     : ロケーション（デフォルト: US）"
    echo ""
    exit 1
fi

PROJECT_ID="$1"
DATASET_NAME="${2:-billing_export}"
LOCATION="${3:-US}"

echo "プロジェクト ID : $PROJECT_ID"
echo "データセット名 : $DATASET_NAME"
echo "ロケーション   : $LOCATION"
echo ""

# ======================================
# Step 1: gcloud CLI の確認
# ======================================
info "Step 1/4: gcloud CLI を確認中..."

if ! command -v gcloud &> /dev/null; then
    error "gcloud コマンドが見つかりません"
    echo ""
    echo "Google Cloud SDK をインストールしてください:"
    echo "  https://cloud.google.com/sdk/docs/install"
    exit 1
fi

GCLOUD_VERSION=$(gcloud --version | head -n 1)
success "gcloud CLI: $GCLOUD_VERSION"

# ======================================
# Step 2: 認証状態の確認
# ======================================
info "Step 2/4: 認証状態を確認中..."

# Application Default Credentials の確認
ADC_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"

if [ -f "$ADC_PATH" ]; then
    success "Application Default Credentials が設定されています"
else
    warn "Application Default Credentials が見つかりません"
    echo ""
    read -p "今すぐ認証を行いますか？ (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "ブラウザで認証を行います..."
        gcloud auth application-default login
        
        if [ $? -eq 0 ]; then
            success "認証が完了しました"
        else
            error "認証に失敗しました"
            exit 1
        fi
    else
        warn "認証をスキップしました。後で手動で実行してください:"
        echo "  gcloud auth application-default login"
    fi
fi

# ======================================
# Step 3: BigQuery データセットの作成
# ======================================
info "Step 3/4: BigQuery データセットを作成中..."

# bq コマンドの確認
if ! command -v bq &> /dev/null; then
    error "bq コマンドが見つかりません（Google Cloud SDK に含まれています）"
    exit 1
fi

# データセットが既に存在するか確認
if bq --project_id="$PROJECT_ID" show "$DATASET_NAME" &> /dev/null; then
    success "データセット '$DATASET_NAME' は既に存在します"
else
    bq --project_id="$PROJECT_ID" mk \
        --dataset \
        --location="$LOCATION" \
        --description="GCP Billing Export" \
        "$DATASET_NAME"
    
    if [ $? -eq 0 ]; then
        success "データセット '$DATASET_NAME' を作成しました"
    else
        error "データセットの作成に失敗しました"
        exit 1
    fi
fi

# ======================================
# Step 4: 次のステップの案内
# ======================================
echo ""
echo "========================================"
info "Step 4/4: 残りの手順"
echo "========================================"
echo ""
warn "課金エクスポートの有効化はコンソールで行う必要があります"
echo ""
echo "1. 以下の URL にアクセス:"
echo "   ${BLUE}https://console.cloud.google.com/billing/export${NC}"
echo ""
echo "2. 請求先アカウントを選択"
echo ""
echo "3. 「BigQuery Export」タブ → 「設定を編集」"
echo ""
echo "4. データセット「$DATASET_NAME」を選択して保存"
echo ""
echo "========================================"
success "セットアップが完了しました！"
echo "========================================"
echo ""
echo "次に VS Code で以下を設定してください:"
echo "  gcpBilling.projectId = \"$PROJECT_ID\""
echo ""
