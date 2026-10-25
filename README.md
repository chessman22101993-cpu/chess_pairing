# Pairing Desk

A small chess tournament manager for in-person games. Open `index.html` in a modern browser, or install the hosted version on a phone as a web app. Tournament setup, pairings, result entry, standings, and CSV export work offline.

## Use

1. Enter a tournament name and choose Swiss or round robin.
2. Add players one at a time or paste lines in `Name, FIDE rating` format. An empty or missing rating becomes 0 and is seeded after rated players.
3. Set the number of Swiss rounds, then start the tournament. Round robin creates the complete schedule automatically: `players − 1` rounds for an even field, or one round per player for an odd field.
4. After each offline game, enter its result. Complete the round to create the next Swiss pairing or reveal the next round-robin pairing. Starting a new round locks the previous round; use the small lock beside its round tab to unlock results for corrections.
5. In Swiss tournaments, use **Add late player** to include a player from the next round. Missed rounds stay at 0 points, and already published pairings/results remain unchanged. The round-robin schedule stays fixed after the tournament starts.
6. In the Swiss standings, use the player menu to skip the next unpaired round or withdraw from the tournament. Skipping gives 0 points for that round and allows the player to return; withdrawal keeps past results and removes the player from later pairings. If a player was already paired and does not show, enter a forfeit result on that board.
7. Print the current round, export standings to CSV, or download a JSON backup. Restore a JSON backup from the same app.

The app awards 1 point for a win, ½ for a draw, and 0 for a loss. An odd field receives a 1-point bye. Standings use Buchholz for Swiss and Sonneborn–Berger for round robin, then FIDE rating.

Tournament data is saved in the browser's local storage on that device. Clearing browser storage clears the saved tournament, so export the standings when you need a copy.

## Install on a phone

The app can be published for free with GitHub Pages:

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**, choose **`main`** and **`/(root)`**, then save.
3. After GitHub finishes publishing, visit <https://chessman22101993-cpu.github.io/chess_pairing/> on your phone.
4. On Android, open Chrome's menu and choose **Install app** or **Add to Home screen**. On iPhone, open the site in Safari, tap **Share → Add to Home Screen**, then tap **Add**.

The hosted app caches its files after the first online visit, so it can open offline afterward. Tournament data remains local to each browser; use **JSON backup** and **Restore backup** to move a tournament between devices. Opening `index.html` directly with a `file://` URL does not enable app installation or service-worker caching.

## Pairing rules reference

The Swiss approach follows core principles in the current FIDE handbook: declare the number of rounds in advance, rank the initial field by rating, pair primarily within score groups, avoid repeat opponents, award byes consistently, and balance colours. The Swiss implementation here is intended for club use; it is not a FIDE-certified pairing engine and does not reproduce every clause of the FIDE Dutch system.

- [FIDE General handling rules for Swiss tournaments, effective 1 February 2026](https://handbook.fide.com/chapter/GeneralHandlingRulesForSwissTournaments202602)
- [FIDE Dutch System, effective 1 February 2026](https://handbook.fide.com/chapter/C0403202602)
