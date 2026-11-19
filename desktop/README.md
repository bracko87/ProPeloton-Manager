# ProPeloton Manager desktop preview

This is a Windows/Linux desktop app for the **existing online** cycling manager game at https://propelotonmanager.com/. Like the Tennis Legacy desktop preview, it uses a sandboxed Electron window pointing to the live website. There is no separate offline gameplay or second player database.

Players log in with their existing accounts. Race results, money, Premium, seasons and team progress are the same as on the website.

## Windows and Linux preview builds

- Windows 64-bit: `ProPelotonManager-Setup-0.1.0-x64.exe`, an NSIS installer with a Windows desktop shortcut and Start-menu entry.
- Linux 64-bit: `ProPelotonManager-0.1.0-x86_64.AppImage`.

The GitHub workflow `.github/workflows/propeloton-desktop-installers.yml` builds both packages on native runners, checks the security tests and exact creator-supplied RPM icon, publishes GitHub Actions artifacts, and publishes a **prerelease** at `desktop-v0.1.0` only if both jobs pass. Nothing is sent to Steam. The release is explicitly a desktop preview; the official game season remains paused until the existing launch date.

### Local test

```bash
cd desktop
npm install
npm run check
npm start
```

Build Windows package: `npm run dist:win` (Windows needed). Build Linux AppImage: `npm run dist:linux`.

### Supplied logo

The original uploaded RPM logo was 1254×1254 pixels. A downsampled, size-optimized copy is committed as `desktop/assets/rpm-original-user-icon.webp.b64`. The checksum-pinned build script `desktop/scripts/generate_icons.py` produces Windows `desktop/build/icon.ico` and Linux/window `desktop/build/icon.png`; both are used for the installer and shortcuts. The icon is not an AI redraw.

Run `python -m pip install Pillow==11.3.0`, then:

```bash
python desktop/scripts/generate_icons.py
python desktop/scripts/generate_icons.py --verify
```

### Before declaring the desktop app production-ready

- Test installing, launching, uninstalling, and the visible shortcut icon on actual Windows 10/11 x64.
- Test sign-in, registration, authentication redirects, Premium/billing, links, multiple launches and reconnect behavior.
- The Electron wrapper requires internet. It intentionally routes external websites (including payment pages) into the default browser.
- **Unsigned installer:** Windows SmartScreen may warn. Do not claim Microsoft code signing or Steam certification.
- Linux AppImage may require FUSE packages depending on the distribution.
- Website-only changes appear in the desktop app automatically; wrapper changes require a new release.
- No game world, database, countdown or scheduled launch changes are made by this desktop feature.
