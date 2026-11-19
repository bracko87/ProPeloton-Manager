# ProPeloton Manager — desktop preview launch checklist (19 Nov 2026)

## Published preview (verified through GitHub release API)

- Desktop preview release: https://github.com/bracko87/ProPeloton-Manager/releases/tag/desktop-v0.1.0
- Windows x64 installer: https://github.com/bracko87/ProPeloton-Manager/releases/download/desktop-v0.1.0/ProPelotonManager-Setup-0.1.0-x64.exe
- Linux x64 AppImage: https://github.com/bracko87/ProPeloton-Manager/releases/download/desktop-v0.1.0/ProPelotonManager-0.1.0-x86_64.AppImage
- Release checksum file: https://github.com/bracko87/ProPeloton-Manager/releases/download/desktop-v0.1.0/SHA256SUMS.txt

This is **not** a new game world, offline game, Steam launch, or change to the official public release schedule. The Electron app connects to https://propelotonmanager.com/ and shares the browser game's existing accounts, club identities, Premium and multiplayer season.

## Creator-provided icon

Source supplied in chat as `favicon4(2).png`: 1254 x 1254 RPM black/white/yellow logo.

- The downsampled WebP source and SHA-256 pin are in `desktop/assets/rpm-original-user-icon.webp.b64` and `desktop/scripts/generate_icons.py`.
- `desktop/build/icon.ico`: Windows app, installer, installed shortcut and Start Menu icon.
- `desktop/build/icon.png`: Electron window and Linux AppImage icon.
- On the public homepage, the same source icon is bundled into the download panel.

## Build and published verification

GitHub Actions desktop installers: https://github.com/bracko87/ProPeloton-Manager/actions/runs/44523734545

- Windows packaging: **passed**.
- Linux packaging: **passed**.
- Icon checksum and generated PNG/ICO verification: **passed**.
- Security URL filtering tests and Node syntax: **passed**.
- GitHub prerelease publishing: **passed**.
- Release assets verified on the public GitHub release API: Windows EXE, Linux AppImage, SHA256SUMS.txt.

GitHub Actions homepage build: https://github.com/bracko87/ProPeloton-Manager/actions/runs/44524679014

- Complete production `npm run build`: **passed**.
- Bundled homepage section, both asset URLs and creator-provided RPM logo: **passed**.
- Homepage positioning in `src/pages/Home.tsx`: **after** `HomeVideoShowcase`, **before** the Game Guide.

## User-facing homepage

Desktop panel includes a Windows download, Linux download and non-clickable Steam/Coming Soon entry; localized copy for supported UI languages. Section explains that this is an internet-connected online game and that the first Windows preview installer is not signed.

## Remaining checks before calling it production-final

- Perform hands-on installation, launch, login, Premium payments, Discord/browser navigation and uninstall on a real Windows machine.
- Check a fresh Windows desktop and Start Menu shortcut displays the RPM icon correctly (the icon was compiled and embedded but no physical Windows user-session test was done).
- Inspect the **live Netlify page** at https://propelotonmanager.com/ after it deploys the new `main` branch, including the appearance/order of downloads. GitHub production build passing is not proof Netlify updated.
- Unsigned installers may show SmartScreen warnings. Code signing is not set up.

**Nothing in this desktop workflow changes game timing, resets, signup, payments or the December 1 release scheduler.**
