# Daily Worder starter site

This folder is ready for GitHub Pages. It contains 30 dated **Crack the Case** puzzles, beginning on 19 July 2026 and ending on 17 August 2026.

## Upload it to GitHub

1. Create a new **public** GitHub repository. A name such as `daily-worder` is suitable.
2. Open the repository and choose **Add file → Upload files**.
3. Upload the **contents of this folder** so that `index.html` is at the top level of the repository. Do not put everything inside an extra outer folder.
4. Commit the files.
5. Open **Settings → Pages**.
6. Under **Build and deployment**, select **Deploy from a branch**.
7. Select the `main` branch and `/ (root)`, then save.
8. GitHub will display the temporary website address after it publishes.

## What the site already does

- Loads the puzzle assigned to the current date in the `Europe/London` timezone.
- Keeps future puzzles locked.
- Provides an archive of published puzzles.
- Saves each player's progress in their own browser.
- Tracks completion time and a browser-based streak.
- Offers a shareable text result.
- Works on mouse and touchscreen devices.

## Important files

- `index.html` — the daily puzzle page.
- `archive.html` — previous cases and locked future cases.
- `app.js` — puzzle play, timer, progress, streak and date selection.
- `archive.js` — archive display.
- `styles.css` — the site design.
- `puzzles/manifest.json` — the publication schedule.
- `puzzles/YYYY-MM-DD.json` — one complete puzzle for each date.

## Adding more puzzles later

Use the separate Daily Worder generator tool. It creates more dated JSON files and updates `manifest.json`. Upload the changed `puzzles` folder to GitHub and commit the update.

## Custom domain

After the temporary GitHub address works, enter `play.worderpuzzles.com` under **Settings → Pages → Custom domain**. Then add the required `play` CNAME record at the company managing the DNS for `worderpuzzles.com`.
