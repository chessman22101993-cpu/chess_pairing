# Pairing Desk

A small, local chess tournament manager for in-person games. Open `index.html` in a modern browser to use it; no install, account, server, or network connection is needed for tournament setup, pairings, result entry, standings, and CSV export.

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

## Pairing rules reference

The Swiss approach follows core principles in the current FIDE handbook: declare the number of rounds in advance, rank the initial field by rating, pair primarily within score groups, avoid repeat opponents, award byes consistently, and balance colours. The Swiss implementation here is intended for club use; it is not a FIDE-certified pairing engine and does not reproduce every clause of the FIDE Dutch system.

- [FIDE General handling rules for Swiss tournaments, effective 1 February 2026](https://handbook.fide.com/chapter/GeneralHandlingRulesForSwissTournaments202602)
- [FIDE Dutch System, effective 1 February 2026](https://handbook.fide.com/chapter/C0403202602)
