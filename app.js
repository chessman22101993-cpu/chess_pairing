(() => {
  'use strict';

  const STORAGE_KEY = 'pairing-desk-v1';
  const THEME_STORAGE_KEY = 'pairing-desk-theme';
  const $ = (selector) => document.querySelector(selector);
  const els = {
    name: $('#tournamentName'), roundCount: $('#roundCount'), playerName: $('#playerName'), playerRating: $('#playerRating'),
    playerForm: $('#playerForm'), playerList: $('#playerList'), playerCount: $('#playerCount'), clearPlayers: $('#clearPlayers'),
    start: $('#startTournament'), setup: $('#setupView'), tournament: $('#tournamentView'), swissRounds: $('#swissRoundsRow'), rrInfo: $('#rrInfo'),
    rrCount: $('#rrRoundCount'), title: $('#pageTitle'), subtitle: $('#pageSubtitle'), headingActions: $('#headingActions'),
    summaryName: $('#summaryName'), summaryFormat: $('#summaryFormat'), summaryPlayers: $('#summaryPlayers'), summaryRounds: $('#summaryRounds'),
    summaryStatus: $('#summaryStatus'), roundHeading: $('#roundHeading'), roundDescription: $('#roundDescription'), roundStatus: $('#roundStatus'),
    tabs: $('#roundTabs'), pairingRows: $('#pairingRows'), progressText: $('#resultProgressText'), progressBar: $('#resultProgressBar'),
    nextRound: $('#nextRound'), standingsRows: $('#standingsRows'), standingsCount: $('#standingsCount'), finishedBanner: $('#finishedBanner'),
    info: $('#pairingInfo'), toast: $('#toast')
  };

  let state = loadState();
  let toastTimer;
  let managedPlayerId = null;
  let deferredInstallPrompt = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.players)) {
        if (saved.tournament && !Array.isArray(saved.tournament.lockedRounds)) {
          const tournament = saved.tournament;
          const lockedThrough = tournament.complete ? tournament.rounds.length : tournament.currentRound;
          tournament.lockedRounds = Array.from({ length: Math.max(0, lockedThrough) }, (_, index) => index);
        }
        return saved;
      }
      return { players: [], format: 'swiss', roundsPlanned: 5, name: '', tournament: null };
    } catch (_) {
      return { players: [], format: 'swiss', roundsPlanned: 5, name: '', tournament: null };
    }
  }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function playerById(id) { return state.players.find((player) => player.id === id); }
  function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase(); }
  function roundLabel(index) { return `Round ${index + 1}`; }
  function currentTournament() { return state.tournament; }
  function isRoundLocked(index) { return Boolean(currentTournament()?.lockedRounds?.includes(index)); }
  function isForfeitResult(result) { return result === '1-0f' || result === '0-1f'; }
  function isAvailableForRound(player, roundIndex) {
    if (Number.isInteger(player.joinedRound) && roundIndex < player.joinedRound) return false;
    if (Number.isInteger(player.withdrawnFromRound) && roundIndex >= player.withdrawnFromRound) return false;
    return !(player.skippedRounds || []).includes(roundIndex);
  }
  function allPairings() {
    const tournament = currentTournament();
    if (!tournament) return [];
    return tournament.rounds.slice(0, tournament.currentRound + 1).flatMap((round) => round.pairings);
  }

  function playerScores() {
    const scores = new Map(state.players.map((player) => [player.id, 0]));
    allPairings().forEach((pair) => {
      if (pair.bye) scores.set(pair.bye, (scores.get(pair.bye) || 0) + 1);
      else if (pair.result === '1-0' || pair.result === '1-0f') { scores.set(pair.white, (scores.get(pair.white) || 0) + 1); }
      else if (pair.result === '0-1' || pair.result === '0-1f') { scores.set(pair.black, (scores.get(pair.black) || 0) + 1); }
      else if (pair.result === '½-½') {
        scores.set(pair.white, (scores.get(pair.white) || 0) + 0.5);
        scores.set(pair.black, (scores.get(pair.black) || 0) + 0.5);
      }
    });
    return scores;
  }

  function getPlayerResults(id) {
    const rows = [];
    allPairings().forEach((pair) => {
      if (pair.bye === id) rows.push({ opponent: null, color: null, result: 'bye', points: 1 });
      else if (pair.white === id || pair.black === id) {
        const isWhite = pair.white === id;
        const ownPoints = pair.result === '½-½' ? 0.5 : ((isWhite && (pair.result === '1-0' || pair.result === '1-0f')) || (!isWhite && (pair.result === '0-1' || pair.result === '0-1f')) ? 1 : 0);
        rows.push({ opponent: isWhite ? pair.black : pair.white, color: isForfeitResult(pair.result) ? null : (isWhite ? 'W' : 'B'), result: pair.result, points: ownPoints });
      }
    });
    return rows;
  }

  function getStandings() {
    const scores = playerScores();
    const tournament = currentTournament();
    return state.players.map((player) => {
      const results = getPlayerResults(player.id);
      const games = results.filter((item) => item.opponent && item.result !== null);
      const wins = games.filter((item) => item.result !== null && item.points === 1).length;
      const draws = games.filter((item) => item.result === '½-½').length;
      const losses = games.filter((item) => item.result !== null && item.points === 0).length;
      let tieBreak = 0;
      if (tournament?.format === 'swiss') {
        tieBreak = games.reduce((sum, game) => sum + (scores.get(game.opponent) || 0), 0);
      } else {
        tieBreak = games.reduce((sum, game) => sum + (scores.get(game.opponent) || 0) * (game.result === null ? 0 : game.points), 0);
      }
      return { ...player, points: scores.get(player.id) || 0, tieBreak, games: games.length, wins, draws, losses };
    }).sort((a, b) => b.points - a.points || b.tieBreak - a.tieBreak || b.rating - a.rating || a.name.localeCompare(b.name));
  }

  function setFormat(format) {
    state.format = format;
    document.querySelectorAll('.format-card').forEach((card) => card.classList.toggle('selected', card.dataset.format === format));
    els.swissRounds.classList.toggle('hidden', format !== 'swiss');
    els.rrInfo.classList.toggle('hidden', format !== 'roundRobin');
    updateRoundPreview();
    save();
  }

  function updateRoundPreview() {
    const count = state.players.length;
    const fullRounds = count < 2 ? 0 : (count % 2 === 0 ? count - 1 : count);
    els.rrCount.textContent = `${fullRounds} ${fullRounds === 1 ? 'round' : 'rounds'}`;
    state.roundsPlanned = Math.max(1, Math.min(20, Number(els.roundCount.value) || 5));
    els.start.disabled = state.players.length < 2;
  }

  function renderPlayerList() {
    const players = [...state.players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    els.playerCount.textContent = `${players.length} ${players.length === 1 ? 'player' : 'players'}`;
    els.clearPlayers.disabled = players.length === 0;
    els.start.disabled = players.length < 2;
    els.playerList.classList.toggle('empty-roster', players.length === 0);
    if (!players.length) {
      els.playerList.innerHTML = '<div class="empty-roster-icon">♙</div><b>Your roster is empty</b><small>Add at least 2 players to begin.</small>';
      updateRoundPreview();
      return;
    }
    els.playerList.innerHTML = players.map((player) => `<div class="player-row"><span class="player-avatar">${escapeHTML(initials(player.name))}</span><span class="player-name" title="${escapeHTML(player.name)}">${escapeHTML(player.name)}</span><span class="player-rating">${player.rating}</span><button class="remove-player" type="button" data-remove="${escapeHTML(player.id)}" title="Remove ${escapeHTML(player.name)}" aria-label="Remove ${escapeHTML(player.name)}">×</button></div>`).join('');
    updateRoundPreview();
  }

  function addPlayer(name, rating) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return false;
    const number = Number.parseInt(rating, 10);
    state.players.push({ id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, rating: Number.isFinite(number) && number > 0 ? Math.min(number, 4000) : 0 });
    save();
    return true;
  }

  function makePlayerOrder() {
    return [...state.players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  }

  function reseedPlayers() { makePlayerOrder().forEach((player, index) => { player.seed = index + 1; }); }

  function historyFor(id, rounds = currentTournament()?.rounds || []) {
    const played = [];
    rounds.forEach((round) => round.pairings.forEach((pair) => {
      if (pair.bye === id) played.push({ color: null, opponent: null });
      else if (!isForfeitResult(pair.result) && pair.white === id) played.push({ color: 'W', opponent: pair.black });
      else if (!isForfeitResult(pair.result) && pair.black === id) played.push({ color: 'B', opponent: pair.white });
    }));
    return played;
  }

  function preferredColor(id) {
    const history = historyFor(id).filter((item) => item.color).map((item) => item.color);
    const balance = history.reduce((sum, color) => sum + (color === 'W' ? 1 : -1), 0);
    const recent = history.slice(-2);
    if (recent.length === 2 && recent[0] === recent[1]) return recent[0] === 'W' ? 'B' : 'W';
    if (balance > 0) return 'B';
    if (balance < 0) return 'W';
    if (history.length) return history[history.length - 1] === 'W' ? 'B' : 'W';
    const player = playerById(id);
    return player && player.seed % 2 === 1 ? 'W' : 'B';
  }

  function colorCost(id, color) {
    const history = historyFor(id).filter((item) => item.color).map((item) => item.color);
    const balance = history.reduce((sum, oldColor) => sum + (oldColor === 'W' ? 1 : -1), 0);
    const nextBalance = balance + (color === 'W' ? 1 : -1);
    let cost = Math.abs(nextBalance) * 2;
    if (history.length >= 2 && history[history.length - 1] === color && history[history.length - 2] === color) cost += 20;
    if (Math.abs(nextBalance) > 2) cost += 80;
    if (preferredColor(id) !== color) cost += 3;
    return cost;
  }

  function orientPair(a, b) {
    const costAB = colorCost(a, 'W') + colorCost(b, 'B');
    const costBA = colorCost(b, 'W') + colorCost(a, 'B');
    if (costAB < costBA) return { white: a, black: b };
    if (costBA < costAB) return { white: b, black: a };
    const pa = playerById(a); const pb = playerById(b);
    return pa.seed <= pb.seed ? { white: a, black: b } : { white: b, black: a };
  }

  function playedOpponents() {
    const played = new Set();
    allPairings().forEach((pair) => {
      if (!pair.bye && pair.result !== null && !isForfeitResult(pair.result)) played.add([pair.white, pair.black].sort().join('|'));
    });
    return played;
  }

  function pairSwissRound(roundIndex) {
    const tournament = currentTournament();
    if (roundIndex === 0) {
      const ordered = makePlayerOrder().filter((player) => isAvailableForRound(player, roundIndex));
      ordered.forEach((player, index) => { player.seed = index + 1; });
      let bye = null;
      if (ordered.length % 2) bye = ordered.pop().id;
      const half = ordered.length / 2;
      const pairings = [];
      for (let i = 0; i < half; i++) {
        const oriented = orientPair(ordered[i].id, ordered[i + half].id);
        pairings.push({ ...oriented, result: null });
      }
      if (bye) pairings.push({ bye, result: 'bye' });
      return pairings;
    }

    const scores = playerScores();
    const ordered = [...state.players].filter((player) => isAvailableForRound(player, roundIndex)).sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0) || a.seed - b.seed);
    const allPlayed = playedOpponents();
    const eligibleByes = ordered.filter((player) => !historyFor(player.id).some((item) => item.opponent === null));
    if (ordered.length % 2 === 0) eligibleByes.push(null);
    const byeCandidates = ordered.length % 2 ? eligibleByes.sort((a, b) => (scores.get(a.id) || 0) - (scores.get(b.id) || 0) || b.seed - a.seed) : [null];
    const maxNodes = 60000;

    for (const byeCandidate of byeCandidates) {
      let nodeCount = 0;
      const rest = byeCandidate ? ordered.filter((player) => player.id !== byeCandidate.id) : ordered;
      function search(remaining) {
        if (!remaining.length) return [];
        if (++nodeCount > maxNodes) return null;
        const first = remaining[0];
        const sameScoreCount = remaining.filter((player) => (scores.get(player.id) || 0) === (scores.get(first.id) || 0)).length;
        const preferredSplit = Math.max(1, Math.floor(sameScoreCount / 2));
        const candidates = remaining.slice(1).map((opponent, index) => {
          const opponentIndex = index + 1;
          const scoreDifference = Math.abs((scores.get(first.id) || 0) - (scores.get(opponent.id) || 0));
          const sameScoreDistance = Math.abs(opponentIndex - preferredSplit);
          const penalty = scoreDifference * 100000 + sameScoreDistance * 15 + Math.abs(first.seed - opponent.seed) / 1000 + colorCost(first.id, preferredColor(opponent.id)) / 100;
          return { opponent, penalty };
        }).sort((a, b) => a.penalty - b.penalty || a.opponent.seed - b.opponent.seed);
        for (const { opponent } of candidates) {
          if (allPlayed.has([first.id, opponent.id].sort().join('|'))) continue;
          const next = remaining.filter((player) => player.id !== first.id && player.id !== opponent.id);
          const restPairs = search(next);
          if (restPairs) return [{ ...orientPair(first.id, opponent.id), result: null }, ...restPairs];
        }
        return null;
      }
      const found = search(rest);
      if (found) {
        if (byeCandidate) found.push({ bye: byeCandidate.id, result: 'bye' });
        return found;
      }
    }
    return null;
  }

  function generateRoundRobin(players) {
    const slots = players.map((player) => player.id);
    if (slots.length % 2) slots.push(null);
    const rounds = [];
    for (let roundIndex = 0; roundIndex < slots.length - 1; roundIndex++) {
      const pairs = [];
      for (let board = 0; board < slots.length / 2; board++) {
        const left = slots[board];
        const right = slots[slots.length - 1 - board];
        if (left === null || right === null) {
          pairs.push({ bye: left === null ? right : left, result: 'bye' });
        } else {
          const oriented = orientPair(left, right);
          pairs.push({ ...oriented, result: null });
        }
      }
      rounds.push({ pairings: pairs });
      if (currentTournament()) currentTournament().rounds = [...rounds];
      const last = slots.pop();
      slots.splice(1, 0, last);
    }
    return rounds;
  }

  function startTournament() {
    if (state.players.length < 2) return;
    state.name = els.name.value.trim() || 'Club Chess Tournament';
    state.roundsPlanned = Math.max(1, Math.min(20, Number(els.roundCount.value) || 5));
    const ordered = makePlayerOrder();
    ordered.forEach((player, index) => { player.seed = index + 1; });
    const tournament = { format: state.format, totalRounds: state.format === 'swiss' ? state.roundsPlanned : (state.players.length % 2 === 0 ? state.players.length - 1 : state.players.length), currentRound: 0, rounds: [], lockedRounds: [], complete: false };
    state.tournament = tournament;
    if (tournament.format === 'roundRobin') tournament.rounds = generateRoundRobin(ordered);
    else {
      const firstRound = pairSwissRound(0);
      if (!firstRound) { state.tournament = null; toast('Could not create the first round.'); return; }
      tournament.rounds = [{ pairings: firstRound }];
    }
    tournament.currentRound = 0;
    state.tournament = tournament;
    save();
    render();
    toast('Tournament ready. Enter Round 1 results when games finish.');
  }

  function roundComplete(round) { return round.pairings.every((pair) => pair.bye || pair.result !== null); }
  function advanceRound() {
    const tournament = currentTournament();
    if (!tournament) return;
    const round = tournament.rounds[tournament.currentRound];
    if (!roundComplete(round)) return;
    if (tournament.currentRound + 1 >= tournament.totalRounds) {
      tournament.complete = true;
      tournament.lockedRounds = tournament.rounds.map((_, index) => index);
      selectedRound = tournament.currentRound;
      save(); render(); toast('Final standings are ready.'); return;
    }
    if (tournament.format === 'swiss') {
      const pairings = pairSwissRound(tournament.currentRound + 1);
      if (!pairings) { toast('No legal pairing could be found. Check earlier results or reduce the round count.'); return; }
      tournament.rounds.push({ pairings });
    }
    if (!tournament.lockedRounds.includes(tournament.currentRound)) tournament.lockedRounds.push(tournament.currentRound);
    tournament.currentRound += 1;
    selectedRound = tournament.currentRound;
    save(); render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openLatePlayerDialog() {
    const tournament = currentTournament();
    if (!tournament || tournament.format !== 'swiss' || tournament.complete || tournament.currentRound + 1 >= tournament.totalRounds) return;
    const nextRoundNumber = tournament.currentRound + 2;
    $('#lateEntryNote').textContent = `They will be paired from Round ${nextRoundNumber} and receive 0 points for earlier unplayed rounds. Current pairings and results stay unchanged.`;
    $('#latePlayerName').value = '';
    $('#latePlayerRating').value = '';
    $('#latePlayerDialog').showModal();
    $('#latePlayerName').focus();
  }

  function submitLatePlayer(event) {
    event.preventDefault();
    const tournament = currentTournament();
    const name = $('#latePlayerName').value.trim();
    if (!tournament || tournament.format !== 'swiss' || tournament.complete || tournament.currentRound + 1 >= tournament.totalRounds || !name) return;
    if (state.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      toast('A player with that name is already in the tournament.');
      return;
    }
    const joinedRound = tournament.currentRound + 1;
    if (!addPlayer(name, $('#latePlayerRating').value)) return;
    const player = state.players[state.players.length - 1];
    player.joinedRound = joinedRound;
    reseedPlayers();
    save();
    $('#latePlayerDialog').close();
    renderTournament();
    toast(`${name} will join from Round ${joinedRound + 1}.`);
  }

  function openPlayerManageDialog(playerId) {
    const tournament = currentTournament();
    const player = playerById(playerId);
    if (!tournament || tournament.format !== 'swiss' || tournament.complete || !player) return;
    managedPlayerId = playerId;
    const nextRoundIndex = tournament.currentRound + 1;
    const hasNextRound = nextRoundIndex < tournament.totalRounds;
    const withdrawn = Number.isInteger(player.withdrawnFromRound) && player.withdrawnFromRound <= nextRoundIndex;
    const skipped = (player.skippedRounds || []).includes(nextRoundIndex);
    $('#playerManageTitle').textContent = player.name;
    $('#playerManageNote').textContent = hasNextRound
      ? `Changes apply from ${roundLabel(nextRoundIndex)}. Past scores stay as recorded. If this player is already paired in the current round and does not show, enter a forfeit result on that board.`
      : 'There are no unpaired rounds left. Past scores stay as recorded.';
    $('#playerManageActions').innerHTML = !hasNextRound ? '<p class="manage-empty">No future rounds to update.</p>' : withdrawn
      ? `<button type="button" class="manage-action reinstate" data-player-action="reinstate">↻ <span><b>Reinstate for ${roundLabel(nextRoundIndex)}</b><small>Include this player in future pairings again.</small></span></button>`
      : `${skipped ? `<button type="button" class="manage-action" data-player-action="cancel-skip">↶ <span><b>Cancel skip for ${roundLabel(nextRoundIndex)}</b><small>Keep this player eligible for the next pairing.</small></span></button>` : `<button type="button" class="manage-action" data-player-action="skip">◷ <span><b>Skip ${roundLabel(nextRoundIndex)}</b><small>Give 0 points for this round, then allow a return.</small></span></button>`}<button type="button" class="manage-action withdraw" data-player-action="withdraw">⊘ <span><b>Withdraw before ${roundLabel(nextRoundIndex)}</b><small>Keep past results and remove from later pairings.</small></span></button>`;
    $('#playerManageDialog').showModal();
  }

  function applyPlayerAction(action) {
    const tournament = currentTournament();
    const player = playerById(managedPlayerId);
    if (!tournament || !player || tournament.complete) return;
    const nextRoundIndex = tournament.currentRound + 1;
    if (nextRoundIndex >= tournament.totalRounds) return;
    if (!Array.isArray(player.skippedRounds)) player.skippedRounds = [];
    if (action === 'skip') {
      if (!player.skippedRounds.includes(nextRoundIndex)) player.skippedRounds.push(nextRoundIndex);
      player.withdrawnFromRound = null;
    } else if (action === 'cancel-skip') {
      player.skippedRounds = player.skippedRounds.filter((index) => index !== nextRoundIndex);
    } else if (action === 'withdraw') {
      if (!window.confirm(`Withdraw ${player.name} from ${roundLabel(nextRoundIndex)} onward? Past results stay. Any pairing already published for the current round stays unchanged.`)) return;
      player.withdrawnFromRound = nextRoundIndex;
      player.skippedRounds = player.skippedRounds.filter((index) => index < nextRoundIndex);
    } else if (action === 'reinstate') {
      player.withdrawnFromRound = null;
      player.skippedRounds = player.skippedRounds.filter((index) => index < nextRoundIndex);
    }
    save();
    $('#playerManageDialog').close();
    renderTournament();
    toast(action === 'skip' ? `${player.name} will sit out ${roundLabel(nextRoundIndex)}.` : action === 'withdraw' ? `${player.name} withdrawn from future rounds.` : action === 'reinstate' ? `${player.name} reinstated.` : `${roundLabel(nextRoundIndex)} skip cancelled.`);
  }

  function updatePairingResult(roundIndex, pairingIndex, result) {
    if (isRoundLocked(roundIndex)) return;
    const pair = currentTournament()?.rounds[roundIndex]?.pairings[pairingIndex];
    if (!pair || pair.bye) return;
    pair.result = result || null;
    save();
    renderTournament();
  }

  function toggleRoundLock(index) {
    const tournament = currentTournament();
    if (!tournament || !Number.isInteger(index)) return;
    if (!Array.isArray(tournament.lockedRounds)) tournament.lockedRounds = [];
    if (tournament.lockedRounds.includes(index)) tournament.lockedRounds = tournament.lockedRounds.filter((roundIndex) => roundIndex !== index);
    else tournament.lockedRounds.push(index);
    save();
    renderPairings();
    toast(isRoundLocked(index) ? `${roundLabel(index)} results locked.` : `${roundLabel(index)} unlocked for editing.`);
  }

  function lockIcon(locked) {
    return locked
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3"/></svg>';
  }

  let selectedRound = 0;
  function renderPairings() {
    const tournament = currentTournament();
    const round = tournament.rounds[selectedRound];
    const isCurrent = selectedRound === tournament.currentRound;
    const completed = roundComplete(round);
    els.roundHeading.textContent = roundLabel(selectedRound);
    const locked = isRoundLocked(selectedRound);
    els.roundDescription.textContent = locked ? 'Results are locked. Use the round tab lock to unlock editing.' : selectedRound < tournament.currentRound ? 'Results and pairings from this round.' : (tournament.complete ? 'Final round complete. The final standings are ready.' : 'Enter each result to complete this round. Choose a forfeit result if a paired player does not show.');
    els.roundStatus.classList.toggle('complete', completed);
    els.roundStatus.innerHTML = `<i></i> ${completed ? 'ROUND COMPLETE' : 'IN PROGRESS'}`;
    els.tabs.innerHTML = tournament.rounds.slice(0, tournament.currentRound + 1).map((item, index) => {
      const roundLocked = isRoundLocked(index);
      return `<span class="round-tab-group"><button type="button" class="round-tab ${index === selectedRound ? 'active' : ''} ${roundComplete(item) ? 'done' : ''}" data-round="${index}">R${index + 1}</button><button type="button" class="round-lock ${roundLocked ? 'locked' : ''}" data-lock-round="${index}" aria-label="${roundLocked ? 'Unlock' : 'Lock'} ${roundLabel(index)} results" aria-pressed="${roundLocked}" title="${roundLocked ? 'Unlock results' : 'Lock results'}">${lockIcon(roundLocked)}</button></span>`;
    }).join('');
    const pairings = round.pairings;
    let entered = 0;
    els.pairingRows.innerHTML = pairings.map((pair, index) => {
      if (pair.bye) {
        entered++;
        const player = playerById(pair.bye);
        return `<tr class="bye-row"><td class="board-num">BYE</td><td colspan="3"><div class="board-player"><span class="player-avatar">${escapeHTML(initials(player.name))}</span><span>${escapeHTML(player.name)}<small>${player.rating || 'UNRATED'}</small></span></div></td><td><span class="bye-label">1 POINT</span></td></tr>`;
      }
      if (pair.result !== null) entered++;
      const white = playerById(pair.white); const black = playerById(pair.black);
      const resultValue = pair.result || '';
      return `<tr><td class="board-num">${String(index + 1).padStart(2, '0')}</td><td><div class="board-player"><span class="player-avatar">${escapeHTML(initials(white.name))}</span><span>${escapeHTML(white.name)}<small>${white.rating || 'UNRATED'} · SEED ${white.seed}</small></span></div></td><td><span class="color-chip" title="White"></span></td><td><div class="board-player"><span class="player-avatar">${escapeHTML(initials(black.name))}</span><span>${escapeHTML(black.name)}<small>${black.rating || 'UNRATED'} · SEED ${black.seed}</small></span></div></td><td><select class="result-select ${locked ? 'is-locked' : ''}" data-pairing="${index}" data-round="${selectedRound}" aria-label="Result for board ${index + 1}" ${locked ? 'disabled' : ''}><option value="" ${!resultValue ? 'selected' : ''}>Enter result…</option><option value="1-0" ${resultValue === '1-0' ? 'selected' : ''}>White wins · 1–0</option><option value="0-1" ${resultValue === '0-1' ? 'selected' : ''}>Black wins · 0–1</option><option value="½-½" ${resultValue === '½-½' ? 'selected' : ''}>Draw · ½–½</option><option value="1-0f" ${resultValue === '1-0f' ? 'selected' : ''}>White wins · forfeit</option><option value="0-1f" ${resultValue === '0-1f' ? 'selected' : ''}>Black wins · forfeit</option></select></td></tr>`;
    }).join('');
    const total = pairings.length;
    els.progressText.textContent = `${entered} of ${total} results entered`;
    els.progressBar.style.width = `${total ? Math.round(entered / total * 100) : 0}%`;
    const finalRound = tournament.currentRound + 1 >= tournament.totalRounds;
    els.nextRound.disabled = !completed || !isCurrent || tournament.complete;
    els.nextRound.innerHTML = tournament.complete ? 'Tournament finished <span>✓</span>' : finalRound ? 'Finish tournament <span>✓</span>' : 'Complete round <span>→</span>';
    els.finishedBanner.classList.toggle('hidden', !tournament.complete);
  }

  function renderStandings() {
    const standings = getStandings();
    els.standingsCount.textContent = standings.length;
    if (!standings.length) { els.standingsRows.innerHTML = '<div class="standings-empty">No players yet.</div>'; return; }
    const tournament = currentTournament();
    const tieLabel = tournament.format === 'swiss' ? 'BH' : 'SB';
    const canManageSwissPlayers = tournament.format === 'swiss' && !tournament.complete && tournament.currentRound + 1 < tournament.totalRounds;
    $('#standingHint').textContent = canManageSwissPlayers ? 'Use ··· by a player to skip a round or withdraw.' : `Tie-break: ${tieLabel} · then FIDE rating`;
    els.standingsRows.innerHTML = standings.map((player, index) => {
      const podium = index < 3;
      const joinedLabel = Number.isInteger(player.joinedRound) ? ` · JOINS R${player.joinedRound + 1}` : '';
      const withdrawalLabel = Number.isInteger(player.withdrawnFromRound) ? ` · WITHDRAWS R${player.withdrawnFromRound + 1}` : '';
      const nextSkip = (player.skippedRounds || []).filter((roundIndex) => roundIndex >= tournament.currentRound).sort((a, b) => a - b)[0];
      const skipLabel = !withdrawalLabel && Number.isInteger(nextSkip) ? ` · SITS OUT R${nextSkip + 1}` : '';
      const status = withdrawalLabel || skipLabel;
      const action = canManageSwissPlayers ? `<button type="button" class="manage-player" data-manage-player="${escapeHTML(player.id)}" title="Manage ${escapeHTML(player.name)}" aria-label="Manage ${escapeHTML(player.name)}">···</button>` : '';
      return `<div class="standing-row ${podium ? `podium podium-${index + 1}` : ''} ${tournament.complete && podium ? 'final-podium' : ''} ${withdrawalLabel ? 'is-withdrawn' : ''}"><span class="standing-rank ${podium ? 'top' : ''}">${String(index + 1).padStart(2, '0')}</span><div class="standing-person"><span class="player-avatar">${escapeHTML(initials(player.name))}</span><div><b>${escapeHTML(player.name)}</b><small>${player.rating || 'UNRATED'} · ${tieLabel} ${player.tieBreak.toFixed(1)}${joinedLabel}${status}</small></div></div><span class="standing-points">${formatPoints(player.points)}</span>${action}</div>`;
    }).join('');
  }

  function formatPoints(points) { return Number.isInteger(points) ? String(points) : points.toFixed(1); }
  function renderTournament() {
    const tournament = currentTournament();
    if (!tournament) return;
    selectedRound = Math.min(selectedRound, tournament.currentRound);
    els.setup.classList.add('hidden');
    els.tournament.classList.remove('hidden');
    els.title.textContent = tournament.complete ? 'Final standings' : 'Tournament desk';
    els.subtitle.textContent = tournament.complete ? 'Tournament complete. Review and export the final table.' : 'Record results round by round and track the standings.';
    const canAddLatePlayer = tournament.format === 'swiss' && !tournament.complete && tournament.currentRound + 1 < tournament.totalRounds;
    els.headingActions.innerHTML = `${canAddLatePlayer ? '<button class="button button-quiet" id="printRoundButton">▤ Print round</button><button class="button button-quiet" id="backupExport">↓ Backup</button><button class="button button-quiet" id="backupImportAction">↑ Restore</button><button class="button button-secondary late-player-action" id="latePlayerAction">＋ Add late player</button>' : '<button class="button button-quiet" id="printRoundButton">▤ Print round</button><button class="button button-quiet" id="backupExport">↓ Backup</button><button class="button button-quiet" id="backupImportAction">↑ Restore</button>'}<button class="button button-quiet" id="newTournament">＋ New tournament</button><button class="button button-secondary install-app-button hidden" id="installAppButton" type="button">↓ Install app</button>`;
    syncInstallButton();
    els.summaryName.textContent = state.name;
    els.summaryFormat.textContent = tournament.format === 'swiss' ? 'SWISS SYSTEM' : 'ROUND ROBIN';
    els.summaryPlayers.textContent = state.players.length;
    els.summaryRounds.textContent = tournament.totalRounds;
    els.summaryStatus.textContent = tournament.complete ? 'Complete' : `Round ${tournament.currentRound + 1} of ${tournament.totalRounds}`;
    els.summaryStatus.className = tournament.complete ? 'status-complete' : 'status-in-progress';
    renderPairings(); renderStandings();
  }

  function renderSetup() {
    els.setup.classList.remove('hidden');
    els.tournament.classList.add('hidden');
    els.title.textContent = 'Tournament desk';
    els.subtitle.textContent = 'Set up your field, make pairings, and keep the standings moving.';
    els.headingActions.innerHTML = '<button class="button button-quiet" id="backupExport">↓ Backup</button><button class="button button-quiet" id="backupImportAction">↑ Restore</button><button class="button button-secondary install-app-button hidden" id="installAppButton" type="button">↓ Install app</button>';
    syncInstallButton();
    els.name.value = state.name || '';
    els.roundCount.value = state.roundsPlanned || 5;
    document.querySelector(`input[name="format"][value="${state.format || 'swiss'}"]`).checked = true;
    setFormat(state.format || 'swiss');
    renderPlayerList();
  }

  function render() {
    if (currentTournament()) renderTournament(); else renderSetup();
  }

  function syncInstallButton() {
    $('#installAppButton')?.classList.toggle('hidden', !deferredInstallPrompt);
  }

  function applyTheme(theme, persist = true) {
    const isDark = theme === 'dark';
    const value = isDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    document.querySelector('meta[name="theme-color"]').content = isDark ? '#141a17' : '#f5f3ee';
    const toggle = $('#themeToggle');
    toggle.textContent = isDark ? '☀' : '☾';
    toggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.title = `Switch to ${isDark ? 'light' : 'dark'} mode`;
    if (persist) {
      try { localStorage.setItem(THEME_STORAGE_KEY, value); } catch (_) { /* Theme still changes for this visit. */ }
    }
  }

  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function exportStandings() {
    const standings = getStandings();
    const rows = [['Rank', 'Player', 'FIDE rating', 'Points', 'Tie-break', 'Games', 'Wins', 'Draws', 'Losses']];
    standings.forEach((player, index) => rows.push([index + 1, player.name, player.rating, formatPoints(player.points), player.tieBreak.toFixed(1), player.games, player.wins, player.draws, player.losses]));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${(state.name || 'chess-tournament').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-standings.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function downloadJson(filename, content) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const backup = { app: 'Pairing Desk', version: 1, exportedAt: new Date().toISOString(), state };
    const filename = `${(state.name || 'pairing-desk').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup.json`;
    downloadJson(filename, JSON.stringify(backup, null, 2));
    toast('Tournament backup downloaded.');
  }

  function normalizeBackup(raw) {
    const source = raw?.state || raw;
    if (!source || !Array.isArray(source.players)) throw new Error('Backup has no player list.');
    const players = source.players.map((player) => {
      const id = String(player?.id || '');
      const name = String(player?.name || '').trim();
      const rating = Number(player?.rating);
      if (!id || !name || !Number.isFinite(rating) || rating < 0 || rating > 4000) throw new Error('Backup contains an invalid player.');
      const normalized = { id, name, rating, seed: Number.isInteger(player.seed) ? player.seed : 0 };
      if (Number.isInteger(player.joinedRound) && player.joinedRound >= 0) normalized.joinedRound = player.joinedRound;
      if (Number.isInteger(player.withdrawnFromRound) && player.withdrawnFromRound >= 0) normalized.withdrawnFromRound = player.withdrawnFromRound;
      normalized.skippedRounds = Array.isArray(player.skippedRounds) ? player.skippedRounds.filter((index) => Number.isInteger(index) && index >= 0) : [];
      return normalized;
    });
    if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error('Backup contains duplicate player IDs.');
    players.filter((player) => !player.seed).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)).forEach((player, index) => { player.seed = players.length + index + 1; });
    let tournament = source.tournament || null;
    if (tournament) {
      const allowedResults = new Set([null, 'bye', '1-0', '1-0f', '½-½', '0-1', '0-1f']);
      const ids = new Set(players.map((player) => player.id));
      if (!['swiss', 'roundRobin'].includes(tournament.format) || !Array.isArray(tournament.rounds)) throw new Error('Backup has invalid tournament data.');
      const totalRounds = Number(tournament.totalRounds);
      const currentRound = Number(tournament.currentRound);
      if (!Number.isInteger(totalRounds) || totalRounds < 1 || !Number.isInteger(currentRound) || currentRound < 0 || currentRound >= totalRounds || tournament.rounds.length <= currentRound) throw new Error('Backup has invalid round data.');
      tournament = { ...tournament, totalRounds, currentRound, complete: Boolean(tournament.complete), rounds: tournament.rounds.map((round) => {
        if (!Array.isArray(round.pairings)) throw new Error('Backup contains an invalid round.');
        return { pairings: round.pairings.map((pair) => {
          if (!allowedResults.has(pair.result)) throw new Error('Backup contains an unknown result.');
          if (pair.bye) {
            if (!ids.has(pair.bye)) throw new Error('Backup contains a bye for an unknown player.');
            return { bye: pair.bye, result: 'bye' };
          }
          if (!ids.has(pair.white) || !ids.has(pair.black) || pair.white === pair.black) throw new Error('Backup contains an invalid pairing.');
          return { white: pair.white, black: pair.black, result: pair.result };
        }) };
      }) };
      tournament.lockedRounds = Array.isArray(tournament.lockedRounds) ? [...new Set(tournament.lockedRounds.filter((index) => Number.isInteger(index) && index >= 0 && index < tournament.rounds.length))] : Array.from({ length: tournament.complete ? tournament.rounds.length : tournament.currentRound }, (_, index) => index);
    }
    return { name: String(source.name || ''), format: source.format === 'roundRobin' ? 'roundRobin' : 'swiss', roundsPlanned: Math.max(1, Math.min(20, Number(source.roundsPlanned) || 5)), players, tournament };
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const restored = normalizeBackup(raw);
      if ((state.players.length || state.tournament) && !window.confirm('Restore this backup and replace the current roster or tournament?')) return;
      state = restored;
      selectedRound = restored.tournament?.currentRound || 0;
      save(); render(); toast('Tournament backup restored.');
    } catch (error) {
      toast(error instanceof SyntaxError ? 'That file is not valid JSON.' : (error.message || 'Could not restore this backup.'));
    } finally {
      $('#restoreBackupFile').value = '';
    }
  }

  function resetTournament() {
    if (!window.confirm('Start a new tournament? This will clear this tournament and its results.')) return;
    state = { players: [], format: 'swiss', roundsPlanned: 5, name: '', tournament: null };
    selectedRound = 0; save(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function parseBulk(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let added = 0;
    lines.forEach((line, index) => {
      const [rawName, rawRating] = line.split(/[,\t;]/, 2).map((part) => part.trim());
      if (!rawName || (index === 0 && /^(name|player)$/i.test(rawName))) return;
      if (addPlayer(rawName, rawRating || 0)) added++;
    });
    save(); renderPlayerList();
    if (added) toast(`${added} ${added === 1 ? 'player' : 'players'} added.`);
    else toast('No player names found in that list.');
  }

  els.playerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!addPlayer(els.playerName.value, els.playerRating.value)) return;
    els.playerName.value = ''; els.playerRating.value = ''; els.playerName.focus();
    renderPlayerList();
  });

  els.playerList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    state.players = state.players.filter((player) => player.id !== button.dataset.remove);
    save(); renderPlayerList();
  });

  els.clearPlayers.addEventListener('click', () => { state.players = []; save(); renderPlayerList(); });
  $('#bulkAdd').addEventListener('click', () => { parseBulk($('#bulkPlayers').value); $('#bulkPlayers').value = ''; });
  els.start.addEventListener('click', startTournament);
  els.name.addEventListener('input', () => { state.name = els.name.value; save(); });
  els.roundCount.addEventListener('change', () => { updateRoundPreview(); save(); });
  $('#roundMinus').addEventListener('click', () => { els.roundCount.value = Math.max(1, (Number(els.roundCount.value) || 1) - 1); updateRoundPreview(); save(); });
  $('#roundPlus').addEventListener('click', () => { els.roundCount.value = Math.min(20, (Number(els.roundCount.value) || 1) + 1); updateRoundPreview(); save(); });
  document.querySelectorAll('input[name="format"]').forEach((input) => input.addEventListener('change', () => setFormat(input.value)));
  els.tabs.addEventListener('click', (event) => {
    const lockButton = event.target.closest('[data-lock-round]');
    if (lockButton) { toggleRoundLock(Number(lockButton.dataset.lockRound)); return; }
    const button = event.target.closest('[data-round]');
    if (!button) return;
    selectedRound = Number(button.dataset.round); renderPairings();
  });
  els.pairingRows.addEventListener('change', (event) => {
    const select = event.target.closest('.result-select');
    if (select) updatePairingResult(Number(select.dataset.round), Number(select.dataset.pairing), select.value);
  });
  els.standingsRows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-manage-player]');
    if (button) openPlayerManageDialog(button.dataset.managePlayer);
  });
  $('#playerManageActions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-player-action]');
    if (button) applyPlayerAction(button.dataset.playerAction);
  });
  els.nextRound.addEventListener('click', advanceRound);
  $('#exportCsv').addEventListener('click', exportStandings);
  els.headingActions.addEventListener('click', (event) => { if (event.target.closest('#newTournament')) resetTournament(); });
  els.headingActions.addEventListener('click', (event) => { if (event.target.closest('#latePlayerAction')) openLatePlayerDialog(); });
  els.headingActions.addEventListener('click', (event) => {
    if (event.target.closest('#printRoundButton')) window.print();
    if (event.target.closest('#backupExport')) exportBackup();
    if (event.target.closest('#backupImportAction')) $('#restoreBackupFile').click();
    if (event.target.closest('#installAppButton') && deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      promptEvent.userChoice.then(syncInstallButton, syncInstallButton);
    }
  });
  $('#restoreBackupFile').addEventListener('change', (event) => importBackup(event.target.files[0]));
  $('#latePlayerForm').addEventListener('submit', submitLatePlayer);
  $('#closeLateDialog').addEventListener('click', () => $('#latePlayerDialog').close());
  $('#cancelLatePlayer').addEventListener('click', () => $('#latePlayerDialog').close());
  $('#closePlayerManage').addEventListener('click', () => $('#playerManageDialog').close());
  $('#cancelPlayerManage').addEventListener('click', () => $('#playerManageDialog').close());
  $('#pairingInfoToggle').addEventListener('click', () => { els.info.classList.toggle('hidden'); if (!els.info.classList.contains('hidden')) els.info.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $('#closeInfo').addEventListener('click', () => els.info.classList.add('hidden'));
  $('#navTournament').addEventListener('click', () => { if (currentTournament()) window.scrollTo({ top: 0, behavior: 'smooth' }); else render(); });
  $('#themeToggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    syncInstallButton();
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.warn('Pairing Desk could not enable offline app caching.', error);
      });
    });
  }

  if (state.tournament) selectedRound = state.tournament.currentRound;
  applyTheme(document.documentElement.dataset.theme, false);
  render();
})();
