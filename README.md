# AMR Daily Stats (JS-SDK)

This is a small JS-SDK web UI that lets you input a robot ID and fetch today's task runtime and distance.

## Setup
1. Install dependencies.
2. Create `.env` based on `.env.example` and fill in `APP_ID` and `APP_SECRET`.
3. Run the server.

```bash
npm install
npm run start
```

Open `http://localhost:5177` in your browser.

## Electron EXE
Build a Windows EXE:

```bash
npm run build
```

The installer will be in `dist/`.

## Notes
- The date range uses the server's local timezone.
- Distance is summed from the task field `mileage` for tasks that started today (default unit: km).
- APP_ID / APP_SECRET can be provided from the UI settings (LocalStorage).
- If some tasks started before today, their mileage is not included and a notice is shown.
- Scheduled notifications can send LINE push messages through the LINE Messaging API.
- To send to a LINE group, add the LINE Official Account to that group and use the group ID as `LINE_TO` or in the UI schedule settings.
- LINE notifications use `LINE_CHANNEL_ID` plus `LINE_CHANNEL_SECRET` to issue a temporary token before sending; the UI does not require a separate channel access token field.

## OTA updates with GitHub Releases

Windows builds use `electron-updater` with GitHub Releases. The first installed version must already include this updater. For each new version, increase `version` in `package.json`, run `npm run build`, then upload these generated files to a GitHub Release:

- `dist/latest.yml`
- `dist/AMR統計 Setup x.y.z.exe`
- `dist/AMR統計 Setup x.y.z.exe.blockmap`

Set the GitHub update source by either:

- Environment variables: `GITHUB_OWNER=your-owner` and `GITHUB_REPO=your-repo`
- Or place `update-config.json` next to `AMR統計.exe`:

```json
{
  "provider": "github",
  "owner": "your-owner",
  "repo": "your-repo",
  "private": false
}
```

For private repositories, set `"private": true` and provide `GH_TOKEN` or `GITHUB_TOKEN` in the runtime environment. To publish directly with electron-builder, replace `YOUR_GITHUB_OWNER` and `YOUR_GITHUB_REPO` in `package.json`, set `GH_TOKEN`, then run `npm run build -- --publish always`.
