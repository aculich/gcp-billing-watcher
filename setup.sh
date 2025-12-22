#!/bin/bash
#
# ╔════════════════════════════════════════════════════════════════════╗
# ║  GCP Billing Watcher - セットアップスクリプト                     ║
# ╚════════════════════════════════════════════════════════════════════╝
#
# このスクリプトは以下を自動で実行します：
#   1. gcloud CLI がインストールされているか確認
#   2. Application Default Credentials（認証情報）の確認
#   3. BigQuery データセットの作成
#   4. 次のステップ（GCP コンソールでの設定）を案内
#
# 使い方:
#   ./setup.sh <project-id> [dataset-name] [location]
#
# 例:
#   ./setup.sh my-project                           # US リージョン
#   ./setup.sh my-project billing_export asia-northeast1  # 東京リージョン
#
# 引数:
#   project-id   : GCP プロジェクト ID（必須）
#   dataset-name : BigQuery データセット名（デフォルト: billing_export）
#   location     : データセットのロケーション（デフォルト: US）
#                  東京なら asia-northeast1 を指定
#

# ----- 設定 ----- #
# エラーが発生したらスクリプトを終了する
set -e

# ----- 色の定義（ターミナル出力を見やすくするため） ----- #
RED='\033[0;31m'      # エラー表示用
GREEN='\033[0;32m'    # 成功表示用
YELLOW='\033[1;33m'   # 警告表示用
BLUE='\033[0;34m'     # 情報表示用
NC='\033[0m'          # 色をリセット

# ----- ヘルパー関数（メッセージ表示用） ----- #
info()    { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
error()   { echo -e "${RED}❌ $1${NC}"; }

# ╔════════════════════════════════════════════════════════════════════╗
# ║  ヘッダー表示                                                      ║
# ╚════════════════════════════════════════════════════════════════════╝
echo ""
echo "========================================"
echo "  GCP Billing Watcher セットアップ"
echo "========================================"
echo ""

# ╔════════════════════════════════════════════════════════════════════╗
# ║  引数のチェック                                                    ║
# ╚════════════════════════════════════════════════════════════════════╝
# 第1引数（プロジェクトID）が指定されていない場合は使い方を表示して終了
if [ -z "$1" ]; then
    echo "使い方: $0 <project-id> [dataset-name] [location]"
    echo ""
    echo "引数:"
    echo "  project-id   : GCP プロジェクト ID（必須）"
    echo "  dataset-name : データセット名（デフォルト: billing_export）"
    echo "  location     : ロケーション（デフォルト: US）"
    echo ""
    echo "例:"
    echo "  $0 my-project"
    echo "  $0 my-project billing_export asia-northeast1"
    echo ""
    exit 1
fi

# 引数を変数に格納（デフォルト値を設定）
PROJECT_ID="$1"
DATASET_NAME="${2:-billing_export}"    # 未指定なら billing_export
LOCATION="${3:-US}"                     # 未指定なら US

# 設定内容を表示
echo "📋 設定内容:"
echo "   プロジェクト ID : $PROJECT_ID"
echo "   データセット名 : $DATASET_NAME"
echo "   ロケーション   : $LOCATION"
echo ""

# ╔════════════════════════════════════════════════════════════════════╗
# ║  Step 1: gcloud CLI の確認                                        ║
# ║  → Google Cloud SDK がインストールされているかチェック            ║
# ╚════════════════════════════════════════════════════════════════════╝
info "Step 1/4: gcloud CLI を確認中..."

# gcloud コマンドが存在するかチェック
if ! command -v gcloud &> /dev/null; then
    error "gcloud コマンドが見つかりません"
    echo ""
    echo "Google Cloud SDK をインストールしてください:"
    echo ""
    echo "  Mac (Homebrew):"
    echo "    brew install --cask google-cloud-sdk"
    echo ""
    echo "  その他:"
    echo "    https://cloud.google.com/sdk/docs/install"
    echo ""
    exit 1
fi

# バージョンを表示
GCLOUD_VERSION=$(gcloud --version | head -n 1)
success "gcloud CLI: $GCLOUD_VERSION"

# ╔════════════════════════════════════════════════════════════════════╗
# ║  Step 2: 認証状態の確認                                            ║
# ║  → Application Default Credentials (ADC) が設定されているか       ║
# ║  → ADC は VS Code 拡張機能が GCP に接続するために必要             ║
# ╚════════════════════════════════════════════════════════════════════╝
info "Step 2/4: 認証状態を確認中..."

# ADC ファイルのパス
# 環境変数 GOOGLE_APPLICATION_CREDENTIALS が設定されていればそれを使用
# 未設定ならデフォルトのパスを使用
ADC_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"

# ADC ファイルが存在するかチェック
if [ -f "$ADC_PATH" ]; then
    success "Application Default Credentials が設定されています"
else
    warn "Application Default Credentials が見つかりません"
    echo ""
    echo "💡 ADC とは？"
    echo "   ローカル環境から GCP に接続するための認証情報です。"
    echo "   VS Code 拡張機能が BigQuery からデータを取得するために必要です。"
    echo ""
    
    # ユーザーに認証を行うか確認
    read -p "今すぐ認証を行いますか？ (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "ブラウザで認証を行います..."
        echo "   → ブラウザが開いたら Google アカウントでログインしてください"
        echo ""
        
        gcloud auth application-default login
        
        if [ $? -eq 0 ]; then
            success "認証が完了しました"
        else
            error "認証に失敗しました"
            exit 1
        fi
    else
        warn "認証をスキップしました"
        echo ""
        echo "後で以下のコマンドを実行してください:"
        echo "  gcloud auth application-default login"
        echo ""
    fi
fi

# ╔════════════════════════════════════════════════════════════════════╗
# ║  Step 3: BigQuery データセットの作成                               ║
# ║  → 課金データを保存するためのデータセットを作成                   ║
# ╚════════════════════════════════════════════════════════════════════╝
info "Step 3/4: BigQuery データセットを作成中..."

# bq コマンド（BigQuery CLI）が存在するかチェック
# bq は gcloud CLI に含まれているため、通常は存在するはず
if ! command -v bq &> /dev/null; then
    error "bq コマンドが見つかりません"
    echo ""
    echo "bq は Google Cloud SDK に含まれています。"
    echo "gcloud CLI を再インストールしてください。"
    exit 1
fi

# データセットが既に存在するか確認
# 存在する場合は作成をスキップ
if bq --project_id="$PROJECT_ID" show "$DATASET_NAME" &> /dev/null; then
    success "データセット '$DATASET_NAME' は既に存在します"
else
    # データセットを新規作成
    # --dataset     : データセットを作成することを指定
    # --location    : データの保存場所（リージョン）
    # --description : データセットの説明
    bq --project_id="$PROJECT_ID" mk \
        --dataset \
        --location="$LOCATION" \
        --description="GCP Billing Export - 課金データエクスポート用" \
        "$DATASET_NAME"
    
    if [ $? -eq 0 ]; then
        success "データセット '$DATASET_NAME' を作成しました"
    else
        error "データセットの作成に失敗しました"
        echo ""
        echo "考えられる原因:"
        echo "  - プロジェクト ID が間違っている"
        echo "  - BigQuery API が有効化されていない"
        echo "  - 権限が不足している"
        exit 1
    fi
fi

# ╔════════════════════════════════════════════════════════════════════╗
# ║  Step 4: 次のステップの案内                                        ║
# ║  → GCP コンソールでの手動設定が必要                               ║
# ╚════════════════════════════════════════════════════════════════════╝
echo ""
echo "========================================"
info "Step 4/4: 残りの手順（手動）"
echo "========================================"
echo ""
warn "⚡ 課金エクスポートの有効化は GCP コンソールで行う必要があります"
echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ 1. 以下の URL にアクセス:                                    │"
echo "│    ${BLUE}https://console.cloud.google.com/billing/export${NC}         │"
echo "│                                                             │"
echo "│ 2. 左メニューで「請求先アカウント」を選択                    │"
echo "│                                                             │"
echo "│ 3. 「標準の使用料金」→「設定を編集」をクリック              │"
echo "│                                                             │"
echo "│ 4. 以下を設定:                                               │"
echo "│    - プロジェクト: ${GREEN}$PROJECT_ID${NC}"
echo "│    - データセット: ${GREEN}$DATASET_NAME${NC}"
echo "│                                                             │"
echo "│ 5. 「保存」をクリック                                        │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""

# ╔════════════════════════════════════════════════════════════════════╗
# ║  完了メッセージ                                                    ║
# ╚════════════════════════════════════════════════════════════════════╝
echo "========================================"
success "セットアップが完了しました！"
echo "========================================"
echo ""
echo "📝 次のステップ:"
echo ""
echo "   1. 上記の GCP コンソールで課金エクスポートを有効化"
echo "      （データが蓄積されるまで 24〜48 時間かかります）"
echo ""
echo "   2. VS Code 拡張機能をインストール:"
echo "      Cmd + Shift + P → 'Extensions: Install from VSIX...'"
echo ""
echo "   3. VS Code 設定でプロジェクト ID を設定:"
echo "      gcpBilling.projectId = \"$PROJECT_ID\""
echo ""
