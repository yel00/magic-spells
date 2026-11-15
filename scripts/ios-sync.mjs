// Prepares the iOS project: builds the web app, copies settings into ios/, and
// stamps the project with your own app identity.
//
//   SITE_URL        required  the https address of the deployed site; the app loads it
//   IOS_BUNDLE_ID   optional  your app's identifier, e.g. com.yourname.magicspells
//   APPLE_TEAM_ID   optional  your 10-character Apple developer team id
//   IOS_BUILD       optional  build number (each TestFlight upload needs a higher one)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const site = process.env.SITE_URL || '';
if (!/^https:\/\/[^/\s]+/.test(site)) {
  console.error('Set SITE_URL to your deployed site, for example:\n  SITE_URL=https://your-app.vercel.app npm run ios:sync');
  process.exit(1);
}
execSync('npm run build', { stdio: 'inherit' });
execSync('npx cap sync ios', { stdio: 'inherit' });

const file = 'ios/App/App.xcodeproj/project.pbxproj';
let project = readFileSync(file, 'utf8');
const { IOS_BUNDLE_ID: bundle, APPLE_TEAM_ID: team, IOS_BUILD: build } = process.env;
if (bundle) {
  if (!/^[A-Za-z0-9.-]+$/.test(bundle)) throw new Error('IOS_BUNDLE_ID may only contain letters, digits, dots and hyphens.');
  project = project.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${bundle};`);
}
if (team) {
  if (!/^[A-Z0-9]{10}$/.test(team)) throw new Error('APPLE_TEAM_ID should be the 10-character team id from developer.apple.com → Membership.');
  project = project.replace(/\n(\s*)DEVELOPMENT_TEAM = [^;]*;/g, '').replace(/(\n(\s*)CODE_SIGN_STYLE = Automatic;)/g, `$1\n$2DEVELOPMENT_TEAM = ${team};`);
}
if (build) project = project.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${Number(build) || 1};`);
writeFileSync(file, project);
console.log(`\niOS project loads ${site}${bundle ? `, bundle id ${bundle}` : ''}${team ? `, team ${team}` : ''}${build ? `, build ${build}` : ''}`);
