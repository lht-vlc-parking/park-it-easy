#!/usr/bin/env node

/**
 * Script to delete all GitHub deployments for the repository
 * Requires GITHUB_TOKEN environment variable to be set
 */

import { spawn } from 'child_process';

const REPO_OWNER = 'miguel11nines';
const REPO_NAME = 'park-it-easy-office';

/**
 * Execute a shell command and return the output
 */
function execCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Fetch all deployments from GitHub API
 */
async function fetchDeployments() {
  console.log('Fetching deployments...');
  try {
    const output = await execCommand('gh', [
      'api',
      `repos/${REPO_OWNER}/${REPO_NAME}/deployments`,
      '--paginate'
    ]);
    
    if (!output) {
      return [];
    }
    
    const deployments = JSON.parse(output);
    return deployments;
  } catch (error) {
    console.error('Error fetching deployments:', error.message);
    throw error;
  }
}

/**
 * Delete a single deployment
 */
async function deleteDeployment(deploymentId) {
  try {
    // First, we need to set the deployment status to inactive
    console.log(`Setting deployment ${deploymentId} to inactive...`);
    await execCommand('gh', [
      'api',
      '-X',
      'POST',
      `repos/${REPO_OWNER}/${REPO_NAME}/deployments/${deploymentId}/statuses`,
      '-f',
      'state=inactive'
    ]);

    // Now delete the deployment
    console.log(`Deleting deployment ${deploymentId}...`);
    await execCommand('gh', [
      'api',
      '-X',
      'DELETE',
      `repos/${REPO_OWNER}/${REPO_NAME}/deployments/${deploymentId}`
    ]);

    console.log(`✓ Successfully deleted deployment ${deploymentId}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to delete deployment ${deploymentId}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('=== GitHub Deployment Deletion Script ===\n');

  // Check if GH_TOKEN or GITHUB_TOKEN is set
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error('Error: GH_TOKEN or GITHUB_TOKEN environment variable must be set');
    console.error('Set it with: export GH_TOKEN=your_github_token');
    process.exit(1);
  }

  try {
    // Fetch all deployments
    const deployments = await fetchDeployments();
    
    if (deployments.length === 0) {
      console.log('No deployments found.');
      return;
    }

    console.log(`Found ${deployments.length} deployment(s)\n`);

    // Delete each deployment
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < deployments.length; i++) {
      const deployment = deployments[i];
      console.log(`\n[${i + 1}/${deployments.length}] Processing deployment ID: ${deployment.id}`);
      console.log(`  Environment: ${deployment.environment}`);
      console.log(`  Created: ${deployment.created_at}`);
      
      const success = await deleteDeployment(deployment.id);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Add a small delay to avoid rate limiting
      if (i < deployments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total deployments: ${deployments.length}`);
    console.log(`Successfully deleted: ${successCount}`);
    console.log(`Failed: ${failCount}`);

  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
