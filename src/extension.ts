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

	// コマンド登録: メニューを表示
	context.subscriptions.push(
		vscode.commands.registerCommand('gcpBilling.menu', async () => {
			const items = [
				{ label: '$(sync) 今すぐ更新', action: 'refresh' },
				{ label: '$(link-external) GCP コンソールを開く', action: 'openConsole' },
				{ label: '$(gear) 設定を開く', action: 'openSettings' },
			];

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'GCP Billing Watcher'
			});

			if (selected) {
				switch (selected.action) {
					case 'refresh':
						await fetchAndUpdate();
						break;
					case 'openConsole':
						await vscode.commands.executeCommand('gcpBilling.openConsole');
						break;
					case 'openSettings':
						await vscode.commands.executeCommand('workbench.action.openSettings', 'gcpBilling');
						break;
				}
			}
		})
	);

	// コマンド登録: GCP コンソールを開く
	context.subscriptions.push(
		vscode.commands.registerCommand('gcpBilling.openConsole', () => {
			const config = vscode.workspace.getConfiguration('gcpBilling');
			const projectId = config.get<string>('projectId');
			if (projectId) {
				const url = `https://console.cloud.google.com/billing/reports?project=${projectId}`;
				vscode.env.openExternal(vscode.Uri.parse(url));
			}
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
	const datasetId = config.get<string>('datasetId', 'billing_export');
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
		datasetId,
		credentialsPath || undefined
	);

	log(`プロジェクト ID: ${projectId}`);
	log(`データセット ID: ${datasetId}`);
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
		
		const config = vscode.workspace.getConfiguration('gcpBilling');
		const budget = config.get<number>('monthlyBudget', 0);
		const language = config.get<string>('language', 'auto');
		
		statusBar.update(cost, budget, language);
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
	// gcloud から現在のプロジェクト取得を試みる
	let suggestedId = '';
	try {
		const { execSync } = require('child_process');
		suggestedId = execSync('gcloud config get-value project', { encoding: 'utf8' }).trim();
	} catch (e) {
		// gcloud が使えない場合は無視
	}

	const action = await vscode.window.showWarningMessage(
		'GCP Billing Watcher: プロジェクト ID が設定されていません',
		'設定する',
		'後で'
	);

	if (action === '設定する') {
		const projectId = await vscode.window.showInputBox({
			prompt: 'GCP プロジェクト ID を入力してください',
			placeHolder: 'my-project-id',
			value: suggestedId, // 自動検知した ID を初期値に設定
			validateInput: (value) => {
				if (!value || value.trim() === '') {
					return 'プロジェクト ID を入力してください';
				}
				if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)) {
					return 'プロジェクト ID の形式が正しくありません';
				}
				return null;
			}
		});

		if (projectId) {
			const config = vscode.workspace.getConfiguration('gcpBilling');
			await config.update('projectId', projectId, vscode.ConfigurationTarget.Global);
			log(`プロジェクト ID を設定しました: ${projectId}`);
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
