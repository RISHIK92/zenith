const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Skip intermediate universal-merge temp directories; only sign the final merged app.
  if (context.appOutDir.endsWith('-temp')) return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[afterPack] Ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
