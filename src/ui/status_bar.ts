/**
 * Google Cloud Billing Watcher - Status Bar Manager
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
		this.item.command = 'gcpBilling.menu';
		this.item.text = '$(cloud) Google Cloud: --';
		this.item.tooltip = 'Google Cloud Billing Watcher - クリックしてメニューを表示';
		this.item.show();
	}

	/**
	 * ローディング状態を表示
	 */
	showLoading(): void {
		this.item.text = '$(sync~spin) Google Cloud: ...';
		this.item.backgroundColor = undefined;
	}

	/**
	 * エラー状態を表示
	 */
	showError(message: string): void {
		this.item.text = '$(error) Google Cloud: Error';
		this.item.tooltip = `エラー: ${message}`;
		this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
	}

	/**
	 * 課金データを表示
	 */
	update(cost: BillingCost, budget: number = 0, language: string = 'auto'): void {
		const locale = this.getLocale(language);
		const monthlyFormatted = this.formatCurrency(cost.amount, cost.currency, locale);
		const yearlyFormatted = this.formatCurrency(cost.yearlyAmount, cost.currency, locale);
		
		let icon = '$(check)';
		let backgroundColor: vscode.ThemeColor | undefined = undefined;

		// 予算アラートロジック
		if (budget > 0) {
			const ratio = cost.amount / budget;
			if (ratio >= 1.0) {
				icon = '$(error)';
				backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
			} else if (ratio >= 0.8) {
				icon = '$(warning)';
				backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			}
		} else {
			// 予算設定がない場合のデフォルト警告（年間コストベース）
			if (cost.yearlyAmount > 100) {
				icon = '$(warning)';
			}
			if (cost.yearlyAmount > 500) {
				icon = '$(error)';
			}
		}

		// ステータスバー: 当月 / 年間
		this.item.text = `${icon} Google Cloud: ${monthlyFormatted} / ${yearlyFormatted}`;
		this.item.tooltip = this.buildTooltip(cost, budget, language);
		this.item.backgroundColor = backgroundColor;
	}

	/**
	 * 設定未完了の状態を表示
	 */
	showNotConfigured(): void {
		this.item.text = '$(gear) Google Cloud: Not Configured';
		this.item.tooltip = 'クリックして設定を開く（gcpBilling.projectId を設定してください）';
		this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	}

	/**
	 * ロケールを取得
	 */
	private getLocale(language: string): string {
		if (language === 'en') {
			return 'en-US';
		}
		if (language === 'ja') {
			return 'ja-JP';
		}
		// auto の場合はシステム設定（VS Code の設定）に従う
		return vscode.env.language.startsWith('ja') ? 'ja-JP' : 'en-US';
	}

	/**
	 * 通貨をフォーマット
	 */
	private formatCurrency(amount: number, currency: string, locale: string): string {
		try {
			// 通貨が JPY の場合、特定のロケールで小数点以下の扱いが変わる可能性があるため明示的に指定
			return new Intl.NumberFormat(locale, {
				style: 'currency',
				currency: currency,
				minimumFractionDigits: currency === 'JPY' ? 0 : 2,
				maximumFractionDigits: currency === 'JPY' ? 0 : 2,
			}).format(amount);
		} catch {
			// フォールバック
			return `${currency} ${amount.toFixed(2)}`;
		}
	}

	/**
	 * ツールチップを構築
	 */
	private buildTooltip(cost: BillingCost, budget: number, language: string): string {
		const isJa = this.getLocale(language) === 'ja-JP';
		const locale = this.getLocale(language);
		
		const now = new Date();
		const month = now.getMonth() + 1;
		const lastMonth = month === 1 ? 12 : month - 1;

		const labels = {
			title: 'Google Cloud Billing Watcher',
			currentCost: isJa ? '現在のコスト' : 'Current Cost',
			beforeCredits: isJa ? '割引前' : 'Before Credits',
			credits: isJa ? '割引額' : 'Credits',
			total: isJa ? '小計' : 'Subtotal',
			budget: isJa ? '予算' : 'Budget',
			lastMonth: isJa ? `${lastMonth}月 (確定)` : `Last Month (${lastMonth})`,
			last3Months: isJa ? '過去3ヶ月' : 'Last 3 Months',
			yearly: isJa ? `${now.getFullYear()}年間` : `Yearly (${now.getFullYear()})`,
			lastUpdated: isJa ? '最終更新' : 'Last Updated',
			clickMenu: isJa ? 'クリックしてメニューを表示' : 'Click to show menu',
		};
		
		const lines = [
			labels.title,
			'─────────────────────',
			`💰 ${labels.currentCost}:`,
			`   ${labels.beforeCredits}: ${this.formatCurrency(cost.amountBeforeCredits, cost.currency, locale)}`,
			`   ${labels.credits}: ${this.formatCurrency(cost.creditsAmount, cost.currency, locale)}`,
			`   ${labels.total}: ${this.formatCurrency(cost.amount, cost.currency, locale)}`,
		];

		// 予算情報の表示
		if (budget > 0) {
			const ratio = (cost.amount / budget) * 100;
			lines.push(`💰 ${labels.budget}: ${this.formatCurrency(budget, cost.currency, locale)} (${ratio.toFixed(1)}%)`);
		}

		lines.push(
			`📅 ${labels.lastMonth}: ${this.formatCurrency(cost.lastMonthAmount, cost.currency, locale)}`,
			'─────────────────────',
			`📊 ${labels.last3Months}: ${this.formatCurrency(cost.last3MonthsAmount, cost.currency, locale)}`,
			`📊 ${labels.yearly}: ${this.formatCurrency(cost.yearlyAmount, cost.currency, locale)}`,
			'─────────────────────',
			`${labels.lastUpdated}: ${cost.lastUpdated.toLocaleString(locale)}`,
			labels.clickMenu,
		);
		return lines.join('\n');
	}

	/**
	 * リソースを解放
	 */
	dispose(): void {
		this.item.dispose();
	}
}
