# Delete Deployments Script

This script deletes all GitHub deployments for the park-it-easy-office repository.

## Prerequisites

- Node.js installed
- GitHub CLI (`gh`) installed and authenticated
- GitHub token with appropriate permissions (either `GH_TOKEN` or `GITHUB_TOKEN` environment variable)

## Usage

### Using npm/bun script:

```bash
# Set your GitHub token
export GH_TOKEN=your_github_token_here

# Run the script
npm run delete:deployments
# or
bun run delete:deployments
```

### Direct execution:

```bash
# Set your GitHub token
export GH_TOKEN=your_github_token_here

# Run the script directly
node scripts/delete-deployments.mjs
```

## How it works

1. Fetches all deployments from the GitHub repository
2. For each deployment:
   - Sets the deployment status to "inactive"
   - Deletes the deployment
3. Provides a summary of successful and failed deletions

## Note

The script includes a small delay between deletions to avoid hitting GitHub API rate limits.
