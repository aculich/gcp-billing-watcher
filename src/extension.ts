/**
 * GCP Billing Watcher - Extension Entry Point
 * VS Code 拡張機能のエントリポイント
 */

import * as vscode from 'vscode';
import { BillingService } from './core/billing_service';
import { StatusBarManager } from './ui/status_bar';

let billingService: BillingService | null = null;
let statusBar: StatusBarManager;
let refreshInterval: NodeJS.Timeout | undefined;
let outputChannel: vscode.OutputChannel;

/**
 * 拡張機能のアクティベーション
 */
export function activate(context: vscode.ExtensionContext): void {
	outputChannel = vscode.window.createOutputChannel('GCP Billing Watcher');
	log('拡張機能を起動しています...');

	statusBar = new StatusBarManager();
	context.subscriptions.push(statusBar);

	// コマンド登録: 今すぐ更新
	context.subscriptions.push(
		vscode.commands.registerCommand('gcpBilling.refresh', async () => {
			log('手動更新がリクエストされました');
			await fetchAndUpdate();
		})
	);

	// コマンド登録: ログを表示
	context.subscriptions.push(
		vscode.commands.registerCommand('gcpBilling.showLogs', () => {
			outputChannel.show();
		})
	);

	// 設定変更の監視
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('gcpBilling')) {
				log('設定が変更されました。再初期化します...');
				initialize();
			}
		})
	);

	// 初期化
	initialize();

	log('拡張機能の起動が完了しました');
}

/**
 * 初期化処理
 */
function initialize(): void {
	const config = vscode.workspace.getConfiguration('gcpBilling');
	const projectId = config.get<string>('projectId', '');
	const credentialsPath = config.get<string>('credentialsPath', '');
	const refreshIntervalMinutes = config.get<number>('refreshIntervalMinutes', 30);

	// 既存のインターバルをクリア
	if (refreshInterval) {
		clearInterval(refreshInterval);
		refreshInterval = undefined;
	}

	// プロジェクト ID が設定されていない場合、設定ダイアログを表示
	if (!projectId) {
		log('プロジェクト ID が設定されていません');
		statusBar.showNotConfigured();
		billingService = null;
		
		// 初回起動時に設定を促すダイアログを表示
		promptForProjectId();
		return;
	}

	// BillingService を初期化
	billingService = new BillingService(
		projectId,
		credentialsPath || undefined
	);

	log(`プロジェクト ID: ${projectId}`);
	log(`更新間隔: ${refreshIntervalMinutes} 分`);

	// 初回取得
	fetchAndUpdate();

	// 定期更新を設定
	const intervalMs = refreshIntervalMinutes * 60 * 1000;
	refreshInterval = setInterval(() => {
		log('定期更新を実行します...');
		fetchAndUpdate();
	}, intervalMs);
}

/**
 * 課金データを取得して UI を更新
 */
async function fetchAndUpdate(): Promise<void> {
	if (!billingService) {
		statusBar.showNotConfigured();
		return;
	}

	statusBar.showLoading();

	try {
		const cost = await billingService.fetchCurrentMonthCost();
		log(`課金データ取得成功: ${cost.currency} ${cost.amount.toFixed(2)}`);
		statusBar.update(cost);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`エラー: ${message}`);
		statusBar.showError(message);
	}
}

/**
 * ログ出力
 */
function log(message: string): void {
	const timestamp = new Date().toISOString();
	outputChannel.appendLine(`[${timestamp}] ${message}`);
}

/**
 * プロジェクト ID の入力を促すダイアログを表示
 */
async function promptForProjectId(): Promise<void> {
	const action = await vscode.window.showWarningMessage(
		'GCP Billing Watcher: プロジェクト ID が設定されていません',
		'今すぐ設定',
		'後で設定'
	);

	if (action === '今すぐ設定') {
		const projectId = await vscode.window.showInputBox({
			prompt: 'GCP プロジェクト ID を入力してください',
			placeHolder: 'my-project-id',
			validateInput: (value) => {
				if (!value || value.trim() === '') {
					return 'プロジェクト ID を入力してください';
				}
				// GCP プロジェクト ID の形式チェック（簡易）
				if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)) {
					return 'プロジェクト ID の形式が正しくありません（6-30文字、小文字・数字・ハイフンのみ）';
				}
				return null;
			}
		});

		if (projectId) {
			const config = vscode.workspace.getConfiguration('gcpBilling');
			await config.update('projectId', projectId, vscode.ConfigurationTarget.Global);
			log(`プロジェクト ID を設定しました: ${projectId}`);
			vscode.window.showInformationMessage(`GCP Billing Watcher: プロジェクト ID を「${projectId}」に設定しました`);
			// 設定変更により自動で再初期化される
		}
	}
}

/**
 * 拡張機能のディアクティベーション
 */
export function deactivate(): void {
	if (refreshInterval) {
		clearInterval(refreshInterval);
	}
	log('拡張機能を終了しました');
}
