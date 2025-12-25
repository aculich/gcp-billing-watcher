# Change Log

All notable changes to the "Google Cloud Billing Watcher" extension will be documented in this file.

## [0.3.15] - 2025-12-25

### Changed
- 拡張機能の名称を "GCP Billing Watcher" から **"Google Cloud Billing Watcher"** に変更
- ステータスバーのプレフィックスを `GCP:` から **`Google Cloud:`** に変更
- コマンド名のプレフィックスを `GCP Billing:` から **`Google Cloud Billing:`** に統一
- README、設定項目の説明文、ソースコード内のメッセージを一括修正して「Google Cloud」表記に統一

## [0.3.11] - 2024-12-24

### Added
- トラブルシューティング: SSL 証明書検証スキップ設定 (`gcpBilling.skipSslVerification`) を追加
- プロキシ環境などで接続エラーが発生する場合の回避策を提供

## [0.3.10] - 2024-12-24

## [0.3.9] - 2024-12-24

### Changed
- README の最適化とセットアップ手順の簡略化


## [0.3.4] - 2024-12-23

### Fixed
- Marketplace 版で「fetch failed」エラーが発生する問題を修正
- グローバル `fetch` の代わりに `google-auth-library` の `request` メソッドを使用するように変更

## [0.3.2] - 2024-12-23

### Changed
- ドキュメント: ステータスバー表示形式（今月/年間）の説明を追加
- ドキュメント: 過去データの制限事項を統合

## [0.3.1] - 2024-12-23

### Changed
- ドキュメント: 過去データの制限事項を追加

## [0.3.0] - 2024-12-23

### Added
- 先月の課金額をツールチップに表示
- 過去3ヶ月の課金額をツールチップに表示

## [0.2.0] - 2024-12-23

### Added
- 年間課金額の表示機能
- ステータスバーに「今月 / 年間」形式で表示

## [0.1.1] - 2024-12-23

### Fixed
- BigQuery テーブル名の自動発見機能を追加
- `gcp_billing_export_v1_*` パターンのテーブルを動的に検索

## [0.1.0] - 2024-12-22

### Added
- 初回リリース
- 当月の Google Cloud 課金額をステータスバーに表示
- Application Default Credentials による認証
- 設定可能な更新間隔
