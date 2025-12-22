/**
 * GCP Billing Watcher - Billing Service
 * GCP の課金データを取得するコアロジック
 */

import { GoogleAuth } from "google-auth-library";

// 課金データの型定義
export interface BillingCost {
  currency: string;
  amount: number;           // 当月の課金額
  yearlyAmount: number;     // 年間の課金額
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
  private cachedTableName: string | null = null;

  constructor(projectId: string, credentialsPath?: string) {
    this.projectId = projectId;

    // 認証情報の設定
    const authOptions: { scopes: string[]; keyFilename?: string } = {
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    };
    if (credentialsPath) {
      authOptions.keyFilename = credentialsPath;
    }
    this.auth = new GoogleAuth(authOptions);
  }

  /**
   * billing_export データセット内の課金テーブル名を自動発見
   * GCP は gcp_billing_export_v1_XXXXXX のようにサフィックスを付けるため
   */
  private async discoverBillingTableName(accessToken: string): Promise<string> {
    // キャッシュがあれば再利用
    if (this.cachedTableName) {
      return this.cachedTableName;
    }

    const response = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/datasets/billing_export/tables`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to list tables: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      tables?: Array<{ tableReference: { tableId: string } }>;
    };

    if (!data.tables || data.tables.length === 0) {
      throw new Error("No tables found in billing_export dataset");
    }

    // gcp_billing_export_v1_* パターンにマッチするテーブルを探す
    const billingTable = data.tables.find((t) =>
      t.tableReference.tableId.startsWith("gcp_billing_export_v1")
    );

    if (!billingTable) {
      throw new Error(
        "No billing export table found (gcp_billing_export_v1_*)"
      );
    }

    this.cachedTableName = billingTable.tableReference.tableId;
    console.log(`Discovered billing table: ${this.cachedTableName}`);
    return this.cachedTableName;
  }

  /**
   * 当月と年間の課金データを取得
   * Cloud Billing Export to BigQuery を使用して取得
   */
  async fetchCurrentMonthCost(): Promise<BillingCost> {
    try {
      // BigQuery API を使用して課金データを取得
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();

      // テーブル名を自動発見
      const tableName = await this.discoverBillingTableName(accessToken.token!);

      // 現在年月を計算（UTC）
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");

      // BigQuery での課金データクエリ（当月と年間を一度に取得）
      const query = `
        SELECT 
          SUM(CASE WHEN invoice.month = '${year}${month}' THEN cost ELSE 0 END) as monthly_cost,
          SUM(CASE WHEN invoice.month LIKE '${year}%' THEN cost ELSE 0 END) as yearly_cost,
          currency
        FROM \`${this.projectId}.billing_export.${tableName}\`
        WHERE invoice.month LIKE '${year}%'
        GROUP BY currency
        LIMIT 1
      `;

      const response = await fetch(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/queries`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            useLegacySql: false,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `BigQuery API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        rows?: Array<{ f: Array<{ v: string | null }> }>;
      };

      if (data.rows && data.rows.length > 0) {
        const row = data.rows[0];
        if (row && row.f && row.f[0] && row.f[1] && row.f[2]) {
          const cost: BillingCost = {
            amount: parseFloat(row.f[0].v ?? "0"),
            yearlyAmount: parseFloat(row.f[1].v ?? "0"),
            currency: row.f[2].v ?? "USD",
            lastUpdated: new Date(),
          };
          this.lastCost = cost;
          return cost;
        }
      }

      // データがない場合はデフォルト値を返す
      const defaultCost: BillingCost = {
        amount: 0,
        yearlyAmount: 0,
        currency: "USD",
        lastUpdated: new Date(),
      };
      this.lastCost = defaultCost;
      return defaultCost;
    } catch (error) {
      console.error("Failed to fetch billing data:", error);
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
