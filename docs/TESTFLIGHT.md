# Putting Magic Spells on TestFlight

The iPhone/iPad app is a native shell (built with Capacitor) around your
deployed site. It installs from TestFlight like any app, always shows the
current version of the site, and signs in to Spotify exactly as Safari does,
so nothing changes in your Spotify developer settings.

**Status: not yet built or run on a Mac.** The project was generated and
configured on Linux, where iOS apps cannot be compiled. Expect the first build
to need a fix or two.

## One-time setup at Apple

1. **Register the app's identifier.** developer.apple.com → Certificates,
   Identifiers & Profiles → Identifiers → **+** → App IDs → App. Choose a
   bundle ID you own, such as `com.yourname.magicspells`.
2. **Create the app record.** appstoreconnect.apple.com → Apps → **+** → New
   App. Platform iOS, pick that bundle ID, and give it any name and SKU.
3. **Find your team ID.** developer.apple.com → Membership details. It is ten
   characters.

Then choose one of the two routes below.

## Route A: from a Mac (simplest)

Needs Xcode installed and you signed in to it (Xcode → Settings → Accounts).

```bash
npm install
SITE_URL=https://your-app.vercel.app IOS_BUNDLE_ID=com.yourname.magicspells APPLE_TEAM_ID=ABCDE12345 npm run ios:sync
npm run ios:open
```

In Xcode: choose **Any iOS Device** as the destination, then **Product →
Archive**. When the archive appears, **Distribute App → TestFlight & App
Store → Distribute**. For later uploads, raise the build number by adding
`IOS_BUILD=2` (then 3, 4…) to the `ios:sync` line.

## Route B: built by GitHub, no Mac needed

1. **Create an App Store Connect API key.** appstoreconnect.apple.com → Users
   and Access → Integrations → App Store Connect API → **+**. Give it the
   **App Manager** role. Download the `.p8` file (you can only download it
   once) and note the **Key ID** and **Issuer ID**.
2. **Add settings to the GitHub repository.** Settings → Secrets and variables
   → Actions.

   | Tab | Name | Value |
   |---|---|---|
   | Variables | `SITE_URL` | `https://your-app.vercel.app` |
   | Variables | `IOS_BUNDLE_ID` | the bundle ID from step 1 above |
   | Variables | `APPLE_TEAM_ID` | your ten-character team ID |
   | Secrets | `ASC_KEY_ID` | the Key ID |
   | Secrets | `ASC_ISSUER_ID` | the Issuer ID |
   | Secrets | `ASC_KEY_P8` | the whole contents of the `.p8` file |

3. **Run the build.** Actions → **ios-testflight** → **Run workflow**. It
   takes roughly ten to twenty minutes.

Mac build minutes on a private repository count ten times over against
GitHub's free allowance, so one build uses about 100–200 of the 2,000 free
monthly minutes. On a public repository they are free.

## After the upload

1. Apple processes the build for a few minutes; it then appears under the
   app's **TestFlight** tab in App Store Connect.
2. Under **Internal Testing**, create a group and add yourself. Internal
   testers (people on your developer team, up to 100) need no Apple review.
3. Install the **TestFlight** app on the iPhone or iPad and accept the invite.

## Things to know

- **The app needs a connection to start**, because it loads the site.
- **You rarely need a new build.** Changes deployed to the site appear in the
  app immediately. A new TestFlight build is only needed if the shell itself
  changes (icon, permissions, a native feature).
- **TestFlight builds expire after 90 days**; run the build again to renew.
- **Sharing beyond your team** means external testers, which requires Apple's
  beta review. Apple can reject apps that are mainly a website in a shell.
  Spotify's five-user cap for personal apps applies regardless.
- **Signing in with Google, Facebook or Apple on Spotify's login page may be
  blocked inside an app.** Signing in with a Spotify email and password works.
- **Lock-screen controls and background push notifications are not included.**
  Both would need native code on top of this shell.
