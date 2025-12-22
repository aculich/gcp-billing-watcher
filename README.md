# GCP Billing Watcher

VS Code のステータスバーに GCP の当月課金状況を表示する拡張機能です。

## 機能

- 📊 当月の GCP 利用料金をステータスバーに表示
- 🔄 設定可能な間隔で自動更新
- 🔐 Application Default Credentials に対応

---

## セットアップ手順

### Step 1: 認証とデータセットの作成

```bash
./setup.sh <project-id> [dataset-name] [location]

# 例
./setup.sh my-project billing_export asia-northeast1
```

このスクリプトは以下を自動で行います：
- ✅ gcloud CLI の確認
- ✅ 認証状態の確認（未設定なら認証を促す）
- ✅ BigQuery データセットの作成

---

### Step 2: GCP コンソールで課金エクスポートを有効化

> ⚠️ この手順のみ、GCP コンソールでの操作が必要です。

1. [請求データのエクスポート](https://console.cloud.google.com/billing/export) にアクセス
2. 左メニューで対象の請求先アカウントを選択
3. **「標準の使用料金」** セクションの **「設定を編集」** をクリック
4. 以下を設定：
   - **プロジェクト**: Step 1 で指定したプロジェクトを選択
   - **データセット**: `billing_export` を選択
5. **「保存」** をクリック

> 📝 **重要**: エクスポート開始後、データが蓄積されるまで **数時間〜1日** かかります。
> それまでは拡張機能で 404 エラーが表示されますが、正常な動作です。

---

### Step 3: VS Code に拡張機能をインストール

1. VS Code で `Cmd + Shift + P`（Mac）または `Ctrl + Shift + P`（Windows）
2. **「Extensions: Install from VSIX...」** を入力して選択
3. 生成された `gcp-billing-watcher-x.x.x.vsix` を選択
4. **VS Code を再起動**

---

### Step 4: プロジェクト ID の設定

拡張機能の初回起動時、設定ダイアログが自動で表示されます。

- **「今すぐ設定」** をクリック
- プロジェクト ID（例: `my-project`）を入力

手動で設定する場合：
- VS Code 設定（`Cmd + ,`）→ 検索「gcpBilling」→ Project Id を入力

---

## 設定項目

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| `gcpBilling.projectId` | 監視対象の GCP プロジェクト ID | (必須) |
| `gcpBilling.refreshIntervalMinutes` | 更新間隔（分） | 30 |

---

## トラブルシューティング

### 404 エラーが表示される
課金エクスポートのテーブルがまだ作成されていません。エクスポート設定後、数時間〜1日お待ちください。

### ステータスバーに表示されない
1. 拡張機能がインストールされているか確認（`Cmd + Shift + X` → 「GCP Billing」で検索）
2. VS Code を再起動
3. 出力パネル（`Cmd + Shift + U`）→ 「GCP Billing Watcher」を選択してログを確認

---

## 開発者向け（ソースからビルドする場合）

```bash
git clone https://github.com/kkitase/gcp-billing-watcher.git
cd gcp-billing-watcher
npm install
npm run package
```

---

## ライセンス

MIT
