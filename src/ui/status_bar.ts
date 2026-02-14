/**
 * Google Cloud Billing Watcher - Status Bar Manager
 */

import * as vscode from 'vscode';
import { BillingCost } from '../core/billing_service';
import { getMessages, resolveLanguage } from '../i18n/messages';

function currentMessages(): ReturnType<typeof getMessages> {
	const config = vscode.workspace.getConfiguration('gcpBilling');
	const language = config.get<string>('language', 'auto');
	return getMessages(resolveLanguage(language));
}

export class StatusBarManager {
	private item: vscode.StatusBarItem;

	constructor() {
		this.item = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			90
		);
		this.item.command = 'gcpBilling.menu';
		this.item.text = '$(cloud) Google Cloud: --';
		this.item.tooltip = currentMessages().tooltipClickMenu;
		this.item.show();
	}

	showLoading(): void {
		this.item.text = '$(sync~spin) Google Cloud: ...';
		this.item.backgroundColor = undefined;
	}

	showError(message: string): void {
		this.item.text = '$(error) Google Cloud: Error';
		this.item.tooltip = currentMessages().errorPrefix + message;
		this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
	}

	update(cost: BillingCost, budget: number = 0, language: string = 'auto'): void {
		const locale = this.getLocale(language);
		const monthlyFormatted = this.formatCurrency(cost.amount, cost.currency, locale);
		const yearlyFormatted = this.formatCurrency(cost.yearlyAmount, cost.currency, locale);
		const msg = getMessages(resolveLanguage(language));

		let icon = '$(check)';
		let backgroundColor: vscode.ThemeColor | undefined = undefined;

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
			if (cost.yearlyAmount > 100) {
				icon = '$(warning)';
			}
			if (cost.yearlyAmount > 500) {
				icon = '$(error)';
			}
		}

		this.item.text = `${icon} Google Cloud: ${monthlyFormatted} / ${yearlyFormatted}`;
		this.item.tooltip = this.buildTooltip(cost, budget, language, msg);
		this.item.backgroundColor = backgroundColor;
	}

	showNotConfigured(): void {
		this.item.text = '$(gear) Google Cloud: Not Configured';
		this.item.tooltip = currentMessages().notConfiguredTooltip;
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

	private buildTooltip(cost: BillingCost, budget: number, language: string, msg: ReturnType<typeof getMessages>): string {
		const locale = this.getLocale(language);
		const now = new Date();
		const month = now.getMonth() + 1;
		const lastMonth = month === 1 ? 12 : month - 1;
		const year = now.getFullYear();

		const lastMonthLabel = msg.lastMonthFormat.replace('{0}', String(lastMonth));
		const yearlyLabel = msg.yearlyFormat.replace('{0}', String(year));

		const lines = [
			msg.title,
			'─────────────────────',
			`💰 ${msg.currentCost}:`,
			`   ${msg.beforeCredits}: ${this.formatCurrency(cost.amountBeforeCredits, cost.currency, locale)}`,
			`   ${msg.credits}: ${this.formatCurrency(cost.creditsAmount, cost.currency, locale)}`,
			`   ${msg.total}: ${this.formatCurrency(cost.amount, cost.currency, locale)}`,
		];

		if (budget > 0) {
			const ratio = (cost.amount / budget) * 100;
			lines.push(`💰 ${msg.budget}: ${this.formatCurrency(budget, cost.currency, locale)} (${ratio.toFixed(1)}%)`);
		}

		lines.push(
			`📅 ${lastMonthLabel}: ${this.formatCurrency(cost.lastMonthAmount, cost.currency, locale)}`,
			'─────────────────────',
			`📊 ${msg.last3Months}: ${this.formatCurrency(cost.last3MonthsAmount, cost.currency, locale)}`,
			`📊 ${yearlyLabel}: ${this.formatCurrency(cost.yearlyAmount, cost.currency, locale)}`,
			'─────────────────────',
			`${msg.lastUpdated}: ${cost.lastUpdated.toLocaleString(locale)}`,
			msg.clickMenu,
		);
		return lines.join('\n');
	}

	dispose(): void {
		this.item.dispose();
	}
}
