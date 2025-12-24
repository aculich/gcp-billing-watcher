# Change Log

All notable changes to the "GCP Billing Watcher" extension will be documented in this file.

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
- 当月の GCP 課金額をステータスバーに表示
- Application Default Credentials による認証
- 設定可能な更新間隔
