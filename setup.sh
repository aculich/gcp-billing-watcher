#!/bin/bash
#
# Google Cloud Billing Watcher - Setup script
#
# This script:
#   1. Checks that gcloud CLI is installed
#   2. Verifies Application Default Credentials
#   3. Creates the BigQuery dataset
#   4. Guides you through the remaining steps in Google Cloud Console
#
# Usage:
#   ./setup.sh <project-id> [dataset-name] [location]
#
# Examples:
#   ./setup.sh my-project
#   ./setup.sh my-project billing_export asia-northeast1
#
# Arguments:
#   project-id   : Google Cloud project ID (required)
#   dataset-name : BigQuery dataset name (default: billing_export)
#   location     : Dataset location (default: US). Use asia-northeast1 for Tokyo.
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
error()   { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo "========================================"
echo "  Google Cloud Billing Watcher Setup"
echo "========================================"
echo ""

if [ -z "$1" ]; then
    echo "Usage: $0 <project-id> [dataset-name] [location]"
    echo ""
    echo "Arguments:"
    echo "  project-id   : Google Cloud project ID (required)"
    echo "  dataset-name : Dataset name (default: billing_export)"
    echo "  location     : Location (default: US)"
    echo ""
    echo "Examples:"
    echo "  $0 my-project"
    echo "  $0 my-project billing_export asia-northeast1"
    echo ""
    exit 1
fi

PROJECT_ID="$1"
DATASET_NAME="${2:-billing_export}"
LOCATION="${3:-US}"

echo "📋 Settings:"
echo "   Project ID  : $PROJECT_ID"
echo "   Dataset     : $DATASET_NAME"
echo "   Location    : $LOCATION"
echo ""

info "Step 1/4: Checking gcloud CLI..."

if ! command -v gcloud &> /dev/null; then
    error "gcloud command not found"
    echo ""
    echo "Please install the Google Cloud SDK:"
    echo ""
    echo "  Mac (Homebrew):"
    echo "    brew install --cask google-cloud-sdk"
    echo ""
    echo "  Other:"
    echo "    https://cloud.google.com/sdk/docs/install"
    echo ""
    exit 1
fi

GCLOUD_VERSION=$(gcloud --version | head -n 1)
success "gcloud CLI: $GCLOUD_VERSION"

info "Step 2/4: Checking authentication..."

ADC_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"

if [ -f "$ADC_PATH" ]; then
    success "Application Default Credentials are set"
else
    warn "Application Default Credentials not found"
    echo ""
    echo "💡 What is ADC?"
    echo "   Credentials for connecting to Google Cloud from your machine."
    echo "   Required for the VS Code extension to read data from BigQuery."
    echo ""
    
    read -p "Authenticate now? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Opening browser for authentication..."
        echo "   → Sign in with your Google account when the browser opens"
        echo ""
        
        gcloud auth application-default login
        
        if [ $? -eq 0 ]; then
            success "Authentication complete"
        else
            error "Authentication failed"
            exit 1
        fi
    else
        warn "Skipped authentication"
        echo ""
        echo "Run this later when ready:"
        echo "  gcloud auth application-default login"
        echo ""
    fi
fi

info "Step 3/4: Creating BigQuery dataset..."

if ! command -v bq &> /dev/null; then
    error "bq command not found"
    echo ""
    echo "bq is included in the Google Cloud SDK."
    echo "Please reinstall the gcloud CLI."
    exit 1
fi

if bq --project_id="$PROJECT_ID" show "$DATASET_NAME" &> /dev/null; then
    success "Dataset '$DATASET_NAME' already exists"
else
    bq --project_id="$PROJECT_ID" mk \
        --dataset \
        --location="$LOCATION" \
        --description="Google Cloud Billing Export - billing data export" \
        "$DATASET_NAME"
    
    if [ $? -eq 0 ]; then
        success "Created dataset '$DATASET_NAME'"
    else
        error "Failed to create dataset"
        echo ""
        echo "Possible causes:"
        echo "  - Invalid project ID"
        echo "  - BigQuery API not enabled"
        echo "  - Insufficient permissions"
        exit 1
    fi
fi

echo ""
echo "========================================"
info "Step 4/4: Remaining steps (manual)"
echo "========================================"
echo ""
warn "⚡ Billing export must be enabled in Google Cloud Console"
echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ 1. Open:                                                     │"
echo "│    ${BLUE}https://console.cloud.google.com/billing/export${NC}         │"
echo "│                                                             │"
echo "│ 2. Select \"Billing account\" in the left menu                │"
echo "│                                                             │"
echo "│ 3. Click \"Standard usage cost\" → \"Edit settings\"            │"
echo "│                                                             │"
echo "│ 4. Set:                                                      │"
echo "│    - Project: ${GREEN}$PROJECT_ID${NC}"
echo "│    - Dataset: ${GREEN}$DATASET_NAME${NC}"
echo "│                                                             │"
echo "│ 5. Click \"Save\"                                               │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""

echo "========================================"
success "Setup complete!"
echo "========================================"
echo ""
echo "📝 Next steps:"
echo ""
echo "   1. Enable billing export in Google Cloud Console (above)"
echo "      (Data may take 24–48 hours to appear)"
echo ""
echo "   2. Install the VS Code extension:"
echo "      Cmd + Shift + P → 'Extensions: Install from VSIX...'"
echo ""
echo "   3. Set the project ID in VS Code settings:"
echo "      gcpBilling.projectId = \"$PROJECT_ID\""
echo ""
