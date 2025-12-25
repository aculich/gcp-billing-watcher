/**
 * Google Cloud Billing Watcher - Billing Service
 * Google Cloud の課金データを取得するコアロジック
 */

import { GoogleAuth } from "google-auth-library";

// 課金データの型定義
export interface BillingCost {
  currency: string;
  amount: number;           // 当月の課金額（割引後）
  amountBeforeCredits: number; // 当月の課金額（割引前）
  creditsAmount: number;    // 当月のクレジット額（割引額）
  lastMonthAmount: number;  // 先月の課金額
  last3MonthsAmount: number; // 過去3ヶ月の課金額
  yearlyAmount: number;     // 年間の課金額
  lastUpdated: Date;
}

// BigQuery で取得するコストデータの行
interface CostRow {
  total_cost: number;
  currency: string;
}

// BigQuery API レスポンスの型定義
interface BigQueryTablesResponse {
  tables?: Array<{ tableReference: { tableId: string } }>;
}

interface BigQueryQueryResponse {
  rows?: Array<{ f: Array<{ v: string | null }> }>;
}

export class BillingService {
  private auth: GoogleAuth;
  private projectId: string;
  private datasetId: string;
  private lastCost: BillingCost | null = null;
  private cachedTableName: string | null = null;

  constructor(projectId: string, datasetId: string = "billing_export", credentialsPath?: string) {
    this.projectId = projectId;
    this.datasetId = datasetId;

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
   * datasetId 内の課金テーブル名を自動発見
   * Google Cloud は gcp_billing_export_v1_XXXXXX または gcp_billing_export_resource_v1_XXXXXX のように名前を付けるため
   */
  private async discoverBillingTableName(): Promise<string> {
    // キャッシュがあれば再利用
    if (this.cachedTableName) {
      return this.cachedTableName;
    }

    // 認証済みクライアントを取得
    const client = await this.auth.getClient();
    
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/datasets/${this.datasetId}/tables`;
    
    // google-auth-library の request メソッドを使用（認証ヘッダーが自動付与される）
    const response = await client.request<BigQueryTablesResponse>({
      url,
      method: "GET",
    });

    const data = response.data;

    if (!data.tables || data.tables.length === 0) {
      throw new Error(`No tables found in ${this.datasetId} dataset`);
    }

    // gcp_billing_export_v1_* または gcp_billing_export_resource_v1_* パターンにマッチするテーブルを探す
    // 最新のもの（または最初に見つかったもの）を使用
    const billingTable = data.tables.find((t) =>
      t.tableReference.tableId.startsWith("gcp_billing_export_v1") ||
      t.tableReference.tableId.startsWith("gcp_billing_export_resource_v1")
    );

    if (!billingTable) {
      throw new Error(
        `No billing export table found in ${this.datasetId} (pattern: gcp_billing_export_*)`
      );
    }

    this.cachedTableName = billingTable.tableReference.tableId;
    console.log(`Discovered billing table: ${this.cachedTableName}`);
    return this.cachedTableName;
  }

  /**
   * 課金データを取得（当月・先月・過去3ヶ月・年間）
   * Cloud Billing Export to BigQuery を使用して取得
   */
  async fetchCurrentMonthCost(): Promise<BillingCost> {
    try {
      // 認証済みクライアントを取得
      const client = await this.auth.getClient();

      // テーブル名を自動発見
      const tableName = await this.discoverBillingTableName();

      // 現在年月を計算（UTC）
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const currentMonth = `${year}${String(month).padStart(2, "0")}`;
      
      // 先月を計算
      const lastMonthDate = new Date(year, month - 2, 1);
      const lastMonth = `${lastMonthDate.getFullYear()}${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
      
      // 3ヶ月前を計算
      const threeMonthsAgoDate = new Date(year, month - 4, 1);
      const threeMonthsAgo = `${threeMonthsAgoDate.getFullYear()}${String(threeMonthsAgoDate.getMonth() + 1).padStart(2, "0")}`;

      // BigQuery での課金データクエリ（当月・先月・過去3ヶ月・年間を一度に取得）
      // クレジット（割引）を考慮するために cost + SUM(c.amount) を計算する
      // クレジット額そのものも取得する
      const query = `
        SELECT 
          SUM(CASE WHEN invoice.month = '${currentMonth}' THEN cost + (SELECT IFNULL(SUM(amount), 0) FROM UNNEST(credits)) ELSE 0 END) as monthly_cost,
          SUM(CASE WHEN invoice.month = '${lastMonth}' THEN cost + (SELECT IFNULL(SUM(amount), 0) FROM UNNEST(credits)) ELSE 0 END) as last_month_cost,
          SUM(CASE WHEN invoice.month >= '${threeMonthsAgo}' AND invoice.month <= '${currentMonth}' THEN cost + (SELECT IFNULL(SUM(amount), 0) FROM UNNEST(credits)) ELSE 0 END) as last_3months_cost,
          SUM(CASE WHEN invoice.month LIKE '${year}%' THEN cost + (SELECT IFNULL(SUM(amount), 0) FROM UNNEST(credits)) ELSE 0 END) as yearly_cost,
          currency,
          SUM(CASE WHEN invoice.month = '${currentMonth}' THEN cost ELSE 0 END) as monthly_cost_before_credits,
          SUM(CASE WHEN invoice.month = '${currentMonth}' THEN (SELECT IFNULL(SUM(amount), 0) FROM UNNEST(credits)) ELSE 0 END) as monthly_credits
        FROM \`${this.projectId}.${this.datasetId}.${tableName}\`
        GROUP BY currency
        LIMIT 1
      `;

      const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/queries`;
      
      // google-auth-library の request メソッドを使用（認証ヘッダーが自動付与される）
      const response = await client.request<BigQueryQueryResponse>({
        url,
        method: "POST",
        data: {
          query,
          useLegacySql: false,
        },
      });

      const data = response.data;

      if (data.rows && data.rows.length > 0) {
        const row = data.rows[0];
        if (row && row.f && row.f.length >= 7) {
          const cost: BillingCost = {
            amount: parseFloat(row.f[0].v ?? "0"),
            lastMonthAmount: parseFloat(row.f[1].v ?? "0"),
            last3MonthsAmount: parseFloat(row.f[2].v ?? "0"),
            yearlyAmount: parseFloat(row.f[3].v ?? "0"),
            currency: row.f[4].v ?? "USD",
            amountBeforeCredits: parseFloat(row.f[5].v ?? "0"),
            creditsAmount: parseFloat(row.f[6].v ?? "0"),
            lastUpdated: new Date(),
          };
          this.lastCost = cost;
          return cost;
        }
      }

      // データがない場合はデフォルト値を返す
      const defaultCost: BillingCost = {
        amount: 0,
        amountBeforeCredits: 0,
        creditsAmount: 0,
        lastMonthAmount: 0,
        last3MonthsAmount: 0,
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
