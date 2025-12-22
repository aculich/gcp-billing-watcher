/**
 * GCP Billing Watcher - Status Bar Manager
 * ステータスバーへの表示を制御
 */

import * as vscode from 'vscode';
import { BillingCost } from '../core/billing_service';

export class StatusBarManager {
	private item: vscode.StatusBarItem;

	constructor() {
		this.item = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			90 // AGQ より少し左に表示
		);
		this.item.command = 'gcpBilling.refresh';
		this.item.text = '$(cloud) GCP: --';
		this.item.tooltip = 'GCP Billing Watcher - クリックして更新';
		this.item.show();
	}

	/**
	 * ローディング状態を表示
	 */
	showLoading(): void {
		this.item.text = '$(sync~spin) GCP: ...';
		this.item.backgroundColor = undefined;
	}

	/**
	 * エラー状態を表示
	 */
	showError(message: string): void {
		this.item.text = '$(error) GCP: Error';
		this.item.tooltip = `エラー: ${message}`;
		this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
	}

	/**
	 * 課金データを表示
	 */
	update(cost: BillingCost): void {
		const monthlyFormatted = this.formatCurrency(cost.amount, cost.currency);
		const yearlyFormatted = this.formatCurrency(cost.yearlyAmount, cost.currency);
		
		// 年間課金額に応じてアイコンを変更
		let icon = '$(check)';
		if (cost.yearlyAmount > 100) {
			icon = '$(warning)';
		}
		if (cost.yearlyAmount > 500) {
			icon = '$(error)';
		}

		// ステータスバー: 当月 / 年間
		this.item.text = `${icon} GCP: ${monthlyFormatted} / ${yearlyFormatted}`;
		this.item.tooltip = this.buildTooltip(cost);
		this.item.backgroundColor = undefined;
	}

	/**
	 * 設定未完了の状態を表示
	 */
	showNotConfigured(): void {
		this.item.text = '$(gear) GCP: Not Configured';
		this.item.tooltip = 'クリックして設定を開く（gcpBilling.projectId を設定してください）';
		this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	}

	/**
	 * 通貨をフォーマット
	 */
	private formatCurrency(amount: number, currency: string): string {
		try {
			return new Intl.NumberFormat('ja-JP', {
				style: 'currency',
				currency: currency,
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}).format(amount);
		} catch {
			// フォールバック
			return `${currency} ${amount.toFixed(2)}`;
		}
	}

	/**
	 * ツールチップを構築
	 */
	private buildTooltip(cost: BillingCost): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		
		const lines = [
			'GCP Billing Watcher',
			'─────────────────────',
			`📅 ${month}月コスト: ${this.formatCurrency(cost.amount, cost.currency)}`,
			`📊 ${year}年コスト: ${this.formatCurrency(cost.yearlyAmount, cost.currency)}`,
			'─────────────────────',
			`最終更新: ${cost.lastUpdated.toLocaleString('ja-JP')}`,
			'─────────────────────',
			'クリックして今すぐ更新',
		];
		return lines.join('\n');
	}

	/**
	 * リソースを解放
	 */
	dispose(): void {
		this.item.dispose();
	}
}
