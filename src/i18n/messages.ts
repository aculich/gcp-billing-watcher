/**
 * Centralized message catalog for Google Cloud Billing Watcher.
 * English is the default; Japanese is preserved for locale "ja".
 */

import * as vscode from "vscode";

export interface Messages {
  // Extension lifecycle
  extensionStarting: string;
  extensionStarted: string;
  extensionStopped: string;
  // Commands / menu
  refreshRequested: string;
  menuRefreshNow: string;
  menuOpenConsole: string;
  menuOpenSettings: string;
  menuPlaceholder: string;
  // Config / init
  configChanged: string;
  sslSkipWarning: string;
  projectIdNotSet: string;
  projectIdLabel: string;
  datasetIdLabel: string;
  refreshIntervalLabel: string;
  refreshIntervalUnit: string;
  scheduledRefresh: string;
  fetchSuccessPrefix: string;
  errorPrefix: string;
  // Project ID dialog
  projectIdNotSetWarning: string;
  projectIdConfigure: string;
  projectIdLater: string;
  projectIdPrompt: string;
  projectIdPlaceholder: string;
  projectIdRequired: string;
  projectIdInvalid: string;
  projectIdSet: string;
  // Status bar
  tooltipClickMenu: string;
  notConfiguredTooltip: string;
  // Tooltip labels
  title: string;
  currentCost: string;
  beforeCredits: string;
  credits: string;
  total: string;
  budget: string;
  lastMonthFormat: string;
  last3Months: string;
  yearlyFormat: string;
  lastUpdated: string;
  clickMenu: string;
}

const en: Messages = {
  extensionStarting: "Starting extension...",
  extensionStarted: "Extension started",
  extensionStopped: "Extension stopped",
  refreshRequested: "Manual refresh requested",
  menuRefreshNow: "$(sync) Refresh Now",
  menuOpenConsole: "$(link-external) Open Google Cloud Console",
  menuOpenSettings: "$(gear) Open Settings",
  menuPlaceholder: "Google Cloud Billing Watcher",
  configChanged: "Configuration changed. Reinitializing...",
  sslSkipWarning:
    "Warning: Skipping SSL certificate verification (gcpBilling.skipSslVerification: true)",
  projectIdNotSet: "Project ID is not set",
  projectIdLabel: "Project ID: ",
  datasetIdLabel: "Dataset ID: ",
  refreshIntervalLabel: "Refresh interval: ",
  refreshIntervalUnit: " min",
  scheduledRefresh: "Running scheduled refresh...",
  fetchSuccessPrefix: "Billing data fetched: ",
  errorPrefix: "Error: ",
  projectIdNotSetWarning: "Google Cloud Billing Watcher: Project ID is not set",
  projectIdConfigure: "Configure",
  projectIdLater: "Later",
  projectIdPrompt: "Enter Project ID",
  projectIdPlaceholder: "my-project-id",
  projectIdRequired: "Please enter a Project ID",
  projectIdInvalid: "Project ID format is invalid",
  projectIdSet: "Project ID set: ",
  tooltipClickMenu: "Google Cloud Billing Watcher - Click to show menu",
  notConfiguredTooltip:
    "Click to open settings (set gcpBilling.projectId)",
  title: "Google Cloud Billing Watcher",
  currentCost: "Current Cost",
  beforeCredits: "Before Credits",
  credits: "Credits",
  total: "Subtotal",
  budget: "Budget",
  lastMonthFormat: "Last Month ({0})",
  last3Months: "Last 3 Months",
  yearlyFormat: "Yearly ({0})",
  lastUpdated: "Last Updated",
  clickMenu: "Click to show menu",
};

const ja: Messages = {
  extensionStarting: "拡張機能を起動しています...",
  extensionStarted: "拡張機能の起動が完了しました",
  extensionStopped: "拡張機能を終了しました",
  refreshRequested: "手動更新がリクエストされました",
  menuRefreshNow: "$(sync) 今すぐ更新",
  menuOpenConsole: "$(link-external) Google Cloud コンソールを開く",
  menuOpenSettings: "$(gear) 設定を開く",
  menuPlaceholder: "Google Cloud Billing Watcher",
  configChanged: "設定が変更されました。再初期化します...",
  sslSkipWarning:
    "警告: SSL 証明書の検証をスキップします (gcpBilling.skipSslVerification: true)",
  projectIdNotSet: "プロジェクト ID が設定されていません",
  projectIdLabel: "プロジェクト ID: ",
  datasetIdLabel: "データセット ID: ",
  refreshIntervalLabel: "更新間隔: ",
  refreshIntervalUnit: " 分",
  scheduledRefresh: "定期更新を実行します...",
  fetchSuccessPrefix: "課金データ取得成功: ",
  errorPrefix: "エラー: ",
  projectIdNotSetWarning:
    "Google Cloud Billing Watcher: プロジェクト ID が設定されていません",
  projectIdConfigure: "設定する",
  projectIdLater: "後で",
  projectIdPrompt: "プロジェクト ID を入力してください",
  projectIdPlaceholder: "my-project-id",
  projectIdRequired: "プロジェクト ID を入力してください",
  projectIdInvalid: "プロジェクト ID の形式が正しくありません",
  projectIdSet: "プロジェクト ID を設定しました: ",
  tooltipClickMenu: "Google Cloud Billing Watcher - クリックしてメニューを表示",
  notConfiguredTooltip:
    "クリックして設定を開く（gcpBilling.projectId を設定してください）",
  title: "Google Cloud Billing Watcher",
  currentCost: "現在のコスト",
  beforeCredits: "割引前",
  credits: "割引額",
  total: "小計",
  budget: "予算",
  lastMonthFormat: "{0}月 (確定)",
  last3Months: "過去3ヶ月",
  yearlyFormat: "{0}年間",
  lastUpdated: "最終更新",
  clickMenu: "クリックしてメニューを表示",
};

/**
 * Resolves effective language: "auto" uses VS Code UI language, otherwise "en" or "ja".
 */
export function resolveLanguage(configLanguage: string): "en" | "ja" {
  if (configLanguage === "ja") return "ja";
  if (configLanguage === "en") return "en";
  return vscode.env.language.startsWith("ja") ? "ja" : "en";
}

/**
 * Returns the message catalog for the given language. Pass the resolved language ("en" or "ja").
 */
export function getMessages(language: "en" | "ja"): Messages {
  return language === "ja" ? ja : en;
}
