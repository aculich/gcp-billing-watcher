/**
 * GCP Billing Watcher - Billing Service
 * GCP の課金データを取得するコアロジック
 */

import { GoogleAuth } from 'google-auth-library';

// 課金データの型定義
export interface BillingCost {
	currency: string;
	amount: number;
	lastUpdated: Date;
}

// BigQuery で取得するコストデータの行
interface CostRow {
	total_cost: number;
	currency: string;
}

export class BillingService {
	private auth: GoogleAuth;
	private projectId: string;
	private lastCost: BillingCost | null = null;

	constructor(projectId: string, credentialsPath?: string) {
		this.projectId = projectId;

		// 認証情報の設定
		const authOptions: { scopes: string[]; keyFilename?: string } = {
			scopes: ['https://www.googleapis.com/auth/cloud-platform'],
		};
		if (credentialsPath) {
			authOptions.keyFilename = credentialsPath;
		}
		this.auth = new GoogleAuth(authOptions);
	}

	/**
	 * 当月の課金データを取得
	 * Cloud Billing Export to BigQuery を使用して取得
	 */
	async fetchCurrentMonthCost(): Promise<BillingCost> {
		try {
			// BigQuery API を使用して課金データを取得
			const client = await this.auth.getClient();
			const accessToken = await client.getAccessToken();

			// 現在年月を計算（UTC）
			const now = new Date();
			const year = now.getUTCFullYear();
			const month = String(now.getUTCMonth() + 1).padStart(2, '0');
			const startOfMonth = `${year}-${month}-01`;

			// BigQuery での課金データクエリ
			// NOTE: ユーザーが BigQuery に課金エクスポートを設定している前提
			const query = `
				SELECT 
					SUM(cost) as total_cost,
					currency
				FROM \`${this.projectId}.billing_export.gcp_billing_export_v1\`
				WHERE invoice.month = '${year}${month}'
				GROUP BY currency
				LIMIT 1
			`;

			const response = await fetch(
				`https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/queries`,
				{
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${accessToken.token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						query,
						useLegacySql: false,
					}),
				}
			);

			if (!response.ok) {
				throw new Error(`BigQuery API error: ${response.status} ${response.statusText}`);
			}

			const data = await response.json() as { rows?: Array<{ f: Array<{ v: string | null }> }> };

			if (data.rows && data.rows.length > 0) {
				const row = data.rows[0];
				if (row && row.f && row.f[0] && row.f[1]) {
					const cost: BillingCost = {
						amount: parseFloat(row.f[0].v ?? '0'),
						currency: row.f[1].v ?? 'USD',
						lastUpdated: new Date(),
					};
					this.lastCost = cost;
					return cost;
				}
			}

			// データがない場合はデフォルト値を返す
			const defaultCost: BillingCost = {
				amount: 0,
				currency: 'USD',
				lastUpdated: new Date(),
			};
			this.lastCost = defaultCost;
			return defaultCost;
		} catch (error) {
			console.error('Failed to fetch billing data:', error);
			throw error;
		}
	}

	/**
	 * キャッシュされたコストデータを取得
	 */
	getCachedCost(): BillingCost | null {
		return this.lastCost;
	}

	/**
	 * プロジェクト ID を更新
	 */
	setProjectId(projectId: string): void {
		this.projectId = projectId;
	}
}
