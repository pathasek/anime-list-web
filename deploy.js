import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

try {
  // Get remote URL of origin
  const remoteUrl = execSync('git remote get-url origin').toString().trim();
  const distDir = path.resolve('dist');
  
  // Make sure dist directory exists
  if (!fs.existsSync(distDir)) {
    console.error('Dist directory does not exist. Run build first.');
    process.exit(1);
  }
  
  // Run git commands in dist
  const runGit = (args, options = {}) => {
    return execSync(`git ${args}`, { cwd: distDir, stdio: 'inherit', ...options });
  };
  
  if (!fs.existsSync(path.join(distDir, '.git'))) {
    runGit('init');
  }
  
  try {
    // Try to create and checkout branch
    execSync('git checkout -b gh-pages', { cwd: distDir, stdio: 'ignore' });
  } catch (e) {
    // If it already exists, just checkout
    try {
      execSync('git checkout gh-pages', { cwd: distDir, stdio: 'ignore' });
    } catch (checkoutErr) {
      console.warn('Could not checkout gh-pages branch, continuing on current branch...');
    }
  }
  
  runGit('add -A');
  
  // Check if there are changes to commit
  const status = execSync('git status --porcelain', { cwd: distDir }).toString().trim();
  if (status) {
    runGit('commit -m "Deploy to GitHub Pages"');
  } else {
    console.log('No changes to deploy.');
  }
  
  console.log(`Pushing to ${remoteUrl}...`);
  runGit(`push -f "${remoteUrl}" HEAD:gh-pages`);
  console.log('Deployment successful!');
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}
