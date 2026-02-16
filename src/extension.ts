/**
 * Google Cloud Billing Watcher - Extension Entry Point
 */

import * as vscode from "vscode";
import { BillingService } from "./core/billing_service";
import { StatusBarManager } from "./ui/status_bar";
import {
  getMessages,
  resolveLanguage,
  type Messages,
} from "./i18n/messages";

let billingService: BillingService | null = null;
let statusBar: StatusBarManager;
let refreshInterval: NodeJS.Timeout | undefined;
let outputChannel: vscode.OutputChannel;

function currentMessages(): Messages {
  const config = vscode.workspace.getConfiguration("gcpBilling");
  const language = config.get<string>("language", "auto");
  return getMessages(resolveLanguage(language));
}

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Google Cloud Billing Watcher");
  log(currentMessages().extensionStarting);

  statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("gcpBilling.refresh", async () => {
      log(currentMessages().refreshRequested);
      await fetchAndUpdate();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gcpBilling.menu", async () => {
      const msg = currentMessages();
      const items = [
        { label: msg.menuRefreshNow, action: "refresh" },
        { label: msg.menuOpenConsole, action: "openConsole" },
        { label: msg.menuOpenSettings, action: "openSettings" },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: msg.menuPlaceholder,
      });

      if (selected) {
        switch (selected.action) {
          case "refresh":
            await fetchAndUpdate();
            break;
          case "openConsole":
            await vscode.commands.executeCommand("gcpBilling.openConsole");
            break;
          case "openSettings":
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "gcpBilling"
            );
            break;
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gcpBilling.openConsole", () => {
      const config = vscode.workspace.getConfiguration("gcpBilling");
      const projectId = config.get<string>("projectId");
      if (projectId) {
        const url = `https://console.cloud.google.com/billing/reports?project=${projectId}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gcpBilling.showLogs", () => {
      outputChannel.show();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gcpBilling")) {
        log(currentMessages().configChanged);
        initialize();
      }
    })
  );

  initialize();

  log(currentMessages().extensionStarted);
}

function initialize(): void {
  const msg = currentMessages();
  const config = vscode.workspace.getConfiguration("gcpBilling");
  const projectId = config.get<string>("projectId", "");
  const datasetId = config.get<string>("datasetId", "billing_export");
  const credentialsPath = config.get<string>("credentialsPath", "");
  const refreshIntervalMinutes = config.get<number>(
    "refreshIntervalMinutes",
    30
  );
  const skipSslVerification = config.get<boolean>("skipSslVerification", false);

  if (skipSslVerification) {
    log(msg.sslSkipWarning);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  } else {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }

  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = undefined;
  }

  if (!projectId) {
    log(msg.projectIdNotSet);
    statusBar.showNotConfigured();
    billingService = null;
    promptForProjectId();
    return;
  }

  billingService = new BillingService(
    projectId,
    datasetId,
    credentialsPath || undefined
  );

  log(msg.projectIdLabel + projectId);
  log(msg.datasetIdLabel + datasetId);
  log(msg.refreshIntervalLabel + refreshIntervalMinutes + msg.refreshIntervalUnit);

  fetchAndUpdate();

  const intervalMs = refreshIntervalMinutes * 60 * 1000;
  refreshInterval = setInterval(() => {
    log(currentMessages().scheduledRefresh);
    fetchAndUpdate();
  }, intervalMs);
}

async function fetchAndUpdate(): Promise<void> {
  if (!billingService) {
    statusBar.showNotConfigured();
    return;
  }

  statusBar.showLoading();

  try {
    const cost = await billingService.fetchCurrentMonthCost();
    const msg = currentMessages();
    log(msg.fetchSuccessPrefix + cost.currency + " " + cost.amount.toFixed(2));

    const config = vscode.workspace.getConfiguration("gcpBilling");
    const budget = config.get<number>("monthlyBudget", 0);
    const language = config.get<string>("language", "auto");

    statusBar.update(cost, budget, language);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(currentMessages().errorPrefix + message);
    statusBar.showError(message);
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}

const GCLOUD_CONTEXT_CANDIDATES = ["GCLOUD_CONTEXT.md", "docs/GCLOUD_CONTEXT.md"];
const PROJECT_ROW_REGEX = /\|\s*Project\s*\|\s*`([^`]+)`\s*\|/;

/**
 * Tries to discover GCP project ID from GCLOUD_CONTEXT.md in the workspace.
 * Looks for "Config (active)" table row: | Project | `project-id` |
 * Returns the project ID or empty string.
 */
async function discoverProjectFromGcloudContext(): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return "";

  const rootUri = folders[0].uri;
  for (const rel of GCLOUD_CONTEXT_CANDIDATES) {
    const uri = vscode.Uri.joinPath(rootUri, rel);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = new TextDecoder("utf-8").decode(bytes);
      const match = content.match(PROJECT_ROW_REGEX);
      if (match?.[1]) {
        const id = match[1].trim();
        if (/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id)) return id;
      }
    } catch {
      // file not found or unreadable
    }
  }
  return "";
}

async function promptForProjectId(): Promise<void> {
  let suggestedId = "";
  try {
    const { execSync } = require("child_process");
    suggestedId = execSync("gcloud config get-value project", {
      encoding: "utf8",
    }).trim();
  } catch (e) {
    // ignore if gcloud unavailable
  }

  if (!suggestedId) {
    const fromContext = await discoverProjectFromGcloudContext();
    if (fromContext) {
      suggestedId = fromContext;
      log(currentMessages().projectIdSuggestedFromContext);
    }
  }

  const msg = currentMessages();
  const action = await vscode.window.showWarningMessage(
    msg.projectIdNotSetWarning,
    msg.projectIdConfigure,
    msg.projectIdLater
  );

  if (action === msg.projectIdConfigure) {
    const projectId = await vscode.window.showInputBox({
      prompt: msg.projectIdPrompt,
      placeHolder: msg.projectIdPlaceholder,
      value: suggestedId,
      validateInput: (value) => {
        if (!value || value.trim() === "") {
          return msg.projectIdRequired;
        }
        if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)) {
          return msg.projectIdInvalid;
        }
        return null;
      },
    });

    if (projectId) {
      const config = vscode.workspace.getConfiguration("gcpBilling");
      const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      const target = hasWorkspace
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
      await config.update("projectId", projectId, target);
      log(msg.projectIdSet + projectId);
    }
  }
}

export function deactivate(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  log(currentMessages().extensionStopped);
}
