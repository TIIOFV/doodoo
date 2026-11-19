export type GameKind = 'tictactoe' | 'connect4' | 'checkers';

export interface ChatGamePlayer {
  userId: string;
  name: string;
}

export interface ChatGameState {
  kind: GameKind;
  status: 'waiting' | 'playing' | 'finished' | 'declined';
  challenger: ChatGamePlayer;
  opponent?: ChatGamePlayer;
  turn: 'p1' | 'p2';
  winner?: 'p1' | 'p2' | 'draw';
  winCells?: number[];
  /**
   * Compact board array:
   * - tictactoe: length 9 (0 empty, 1 p1/X, 2 p2/O)
   * - connect4: length 42 (6 rows x 7 cols; 0 empty, 1 p1, 2 p2)
   * - checkers: length 64 (8x8; 0 empty, 1 p1 man, 2 p2 man, 3 p1 king, 4 p2 king)
   */
  board: number[];
  moveCount: number;
  lastMove?: { from?: number; to: number };
  chainCell?: number | null;
  updatedAt: string;
}

export interface GameMeta {
  kind: GameKind;
  name: string;
  subtitle: string;
  emoji: string;
}

export const CHAT_GAMES: GameMeta[] = [
  { kind: 'tictactoe', name: 'Jogo da Velha', subtitle: 'Partida rápida 3×3', emoji: '⭕' },
  { kind: 'connect4', name: 'Ligue 4', subtitle: 'Alinhe 4 peças na grade 6×7', emoji: '🔴' },
  { kind: 'checkers', name: 'Damas', subtitle: 'Tabuleiro clássico 8×8 com dama', emoji: '♟️' },
];

export function gameLabel(kind: GameKind): string {
  return CHAT_GAMES.find((g) => g.kind === kind)?.name || 'Jogo';
}

export function createInitialBoard(kind: GameKind): number[] {
  if (kind === 'tictactoe') return Array(9).fill(0);
  if (kind === 'connect4') return Array(42).fill(0);
  // Checkers 8x8: dark squares are (row + col) % 2 === 1
  // P2 (top, rows 0..2) = 2; P1 (bottom, rows 5..7) = 1
  const board = Array(64).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) board[r * 8 + c] = 2;
      else if (r > 4) board[r * 8 + c] = 1;
    }
  }
  return board;
}

export function createGameChallenge(
  kind: GameKind,
  challenger: ChatGamePlayer,
  opponent?: ChatGamePlayer
): ChatGameState {
  return {
    kind,
    status: 'waiting',
    challenger,
    opponent,
    turn: 'p1',
    board: createInitialBoard(kind),
    moveCount: 0,
    chainCell: null,
    updatedAt: new Date().toISOString(),
  };
}

export function acceptGameChallenge(game: ChatGameState, acceptor: ChatGamePlayer): ChatGameState {
  if (game.status !== 'waiting') return game;
  if (acceptor.userId === game.challenger.userId) return game;
  if (game.opponent && game.opponent.userId !== acceptor.userId) return game;
  return {
    ...game,
    status: 'playing',
    opponent: game.opponent || acceptor,
    updatedAt: new Date().toISOString(),
  };
}

export function declineGameChallenge(game: ChatGameState, declinerId: string): ChatGameState {
  if (game.status !== 'waiting') return game;
  if (declinerId === game.challenger.userId) return game;
  return {
    ...game,
    status: 'declined',
    updatedAt: new Date().toISOString(),
  };
}

export function resignGame(game: ChatGameState, userId: string): ChatGameState {
  if (game.status !== 'playing') return game;
  const side = playerSide(game, userId);
  if (!side) return game;
  return {
    ...game,
    status: 'finished',
    winner: side === 'p1' ? 'p2' : 'p1',
    updatedAt: new Date().toISOString(),
  };
}

export function rematchGame(game: ChatGameState): ChatGameState {
  if (!game.opponent) return game;
  // Swap starting turn so both players get to open alternating matches
  const nextStarter: 'p1' | 'p2' = game.winner === 'p1' ? 'p2' : 'p1';
  return {
    ...game,
    status: 'playing',
    turn: nextStarter,
    winner: undefined,
    winCells: undefined,
    board: createInitialBoard(game.kind),
    moveCount: 0,
    lastMove: undefined,
    chainCell: null,
    updatedAt: new Date().toISOString(),
  };
}

export function playerSide(game: ChatGameState, userId?: string): 'p1' | 'p2' | null {
  if (!userId) return null;
  if (game.challenger.userId === userId) return 'p1';
  if (game.opponent?.userId === userId) return 'p2';
  return null;
}

// --- JOGO DA VELHA ---
const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function playTicTacToeMove(game: ChatGameState, userId: string, cell: number): ChatGameState | null {
  if (game.kind !== 'tictactoe' || game.status !== 'playing') return null;
  const side = playerSide(game, userId);
  if (!side || side !== game.turn) return null;
  if (cell < 0 || cell >= 9 || game.board[cell] !== 0) return null;

  const nextBoard = [...game.board];
  const token = side === 'p1' ? 1 : 2;
  nextBoard[cell] = token;

  for (const line of TTT_LINES) {
    if (nextBoard[line[0]] === token && nextBoard[line[1]] === token && nextBoard[line[2]] === token) {
      return {
        ...game,
        board: nextBoard,
        status: 'finished',
        winner: side,
        winCells: line,
        moveCount: game.moveCount + 1,
        lastMove: { to: cell },
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (nextBoard.every((v) => v !== 0)) {
    return {
      ...game,
      board: nextBoard,
      status: 'finished',
      winner: 'draw',
      moveCount: game.moveCount + 1,
      lastMove: { to: cell },
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...game,
    board: nextBoard,
    turn: side === 'p1' ? 'p2' : 'p1',
    moveCount: game.moveCount + 1,
    lastMove: { to: cell },
    updatedAt: new Date().toISOString(),
  };
}

// --- LIGUE 4 (6 rows x 7 cols) ---
export const C4_ROWS = 6;
export const C4_COLS = 7;

function findConnect4Win(board: number[], token: number): number[] | null {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      if (board[r * C4_COLS + c] !== token) continue;
      for (const [dr, dc] of dirs) {
        const cells = [r * C4_COLS + c];
        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= C4_ROWS || nc < 0 || nc >= C4_COLS) break;
          if (board[nr * C4_COLS + nc] !== token) break;
          cells.push(nr * C4_COLS + nc);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

export function playConnect4Move(game: ChatGameState, userId: string, col: number): ChatGameState | null {
  if (game.kind !== 'connect4' || game.status !== 'playing') return null;
  const side = playerSide(game, userId);
  if (!side || side !== game.turn) return null;
  if (col < 0 || col >= C4_COLS) return null;

  let targetCell = -1;
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    const idx = r * C4_COLS + col;
    if (game.board[idx] === 0) {
      targetCell = idx;
      break;
    }
  }
  if (targetCell === -1) return null;

  const nextBoard = [...game.board];
  const token = side === 'p1' ? 1 : 2;
  nextBoard[targetCell] = token;

  const winCells = findConnect4Win(nextBoard, token);
  if (winCells) {
    return {
      ...game,
      board: nextBoard,
      status: 'finished',
      winner: side,
      winCells,
      moveCount: game.moveCount + 1,
      lastMove: { to: targetCell },
      updatedAt: new Date().toISOString(),
    };
  }

  if (nextBoard.every((v) => v !== 0)) {
    return {
      ...game,
      board: nextBoard,
      status: 'finished',
      winner: 'draw',
      moveCount: game.moveCount + 1,
      lastMove: { to: targetCell },
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...game,
    board: nextBoard,
    turn: side === 'p1' ? 'p2' : 'p1',
    moveCount: game.moveCount + 1,
    lastMove: { to: targetCell },
    updatedAt: new Date().toISOString(),
  };
}

// --- DAMAS (Checkers 8x8) ---
export interface CheckersMove {
  from: number;
  to: number;
  captured?: number;
}

function belongsTo(piece: number, side: 'p1' | 'p2'): boolean {
  if (side === 'p1') return piece === 1 || piece === 3;
  return piece === 2 || piece === 4;
}

function isKing(piece: number): boolean {
  return piece === 3 || piece === 4;
}

function pieceDirections(piece: number): [number, number][] {
  if (isKing(piece)) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  // P1 starts at bottom (rows 5..7) and moves UP (-1); P2 moves DOWN (+1)
  return piece === 1
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ];
}

function getCapturesFrom(board: number[], from: number, side: 'p1' | 'p2'): CheckersMove[] {
  const piece = board[from];
  if (!belongsTo(piece, side)) return [];
  const enemy: 'p1' | 'p2' = side === 'p1' ? 'p2' : 'p1';
  const r = Math.floor(from / 8);
  const c = from % 8;
  const moves: CheckersMove[] = [];

  // In Brazilian/standard checkers, men can also capture diagonally in all 4 directions or forward;
  // allowing all 4 diagonal directions for captures makes gameplay intuitive and faithful to Damas Brasileiras!
  const captureDirs: [number, number][] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (const [dr, dc] of captureDirs) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + dr * 2;
    const lc = c + dc * 2;
    if (lr < 0 || lr >= 8 || lc < 0 || lc >= 8) continue;
    const midIdx = mr * 8 + mc;
    const landIdx = lr * 8 + lc;
    if (belongsTo(board[midIdx], enemy) && board[landIdx] === 0) {
      moves.push({ from, to: landIdx, captured: midIdx });
    }
  }
  return moves;
}

export function getCheckersLegalMoves(board: number[], side: 'p1' | 'p2', chainCell?: number | null): CheckersMove[] {
  if (typeof chainCell === 'number') {
    return getCapturesFrom(board, chainCell, side);
  }

  const captures: CheckersMove[] = [];
  const simples: CheckersMove[] = [];

  for (let idx = 0; idx < 64; idx++) {
    const piece = board[idx];
    if (!belongsTo(piece, side)) continue;
    captures.push(...getCapturesFrom(board, idx, side));
    const r = Math.floor(idx / 8);
    const c = idx % 8;
    for (const [dr, dc] of pieceDirections(piece)) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      const dest = nr * 8 + nc;
      if (board[dest] === 0) simples.push({ from: idx, to: dest });
    }
  }

  // Mandatory capture rule (classic Damas)
  return captures.length > 0 ? captures : simples;
}

export function playCheckersMove(game: ChatGameState, userId: string, from: number, to: number): ChatGameState | null {
  if (game.kind !== 'checkers' || game.status !== 'playing') return null;
  const side = playerSide(game, userId);
  if (!side || side !== game.turn) return null;

  const legal = getCheckersLegalMoves(game.board, side, game.chainCell);
  const chosen = legal.find((m) => m.from === from && m.to === to);
  if (!chosen) return null;

  const nextBoard = [...game.board];
  let piece = nextBoard[from];
  nextBoard[from] = 0;
  if (typeof chosen.captured === 'number') {
    nextBoard[chosen.captured] = 0;
  }

  const destRow = Math.floor(to / 8);
  let promoted = false;
  if (piece === 1 && destRow === 0) {
    piece = 3;
    promoted = true;
  } else if (piece === 2 && destRow === 7) {
    piece = 4;
    promoted = true;
  }
  nextBoard[to] = piece;

  // Check multi-jump chain if this was a capture (and not freshly promoted)
  if (typeof chosen.captured === 'number' && !promoted) {
    const followUps = getCapturesFrom(nextBoard, to, side);
    if (followUps.length > 0) {
      return {
        ...game,
        board: nextBoard,
        turn: side,
        chainCell: to,
        moveCount: game.moveCount + 1,
        lastMove: { from, to },
        updatedAt: new Date().toISOString(),
      };
    }
  }

  const nextSide: 'p1' | 'p2' = side === 'p1' ? 'p2' : 'p1';
  const opponentMoves = getCheckersLegalMoves(nextBoard, nextSide, null);
  const opponentPieces = nextBoard.filter((p) => belongsTo(p, nextSide)).length;

  if (opponentPieces === 0 || opponentMoves.length === 0) {
    return {
      ...game,
      board: nextBoard,
      status: 'finished',
      winner: side,
      chainCell: null,
      moveCount: game.moveCount + 1,
      lastMove: { from, to },
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...game,
    board: nextBoard,
    turn: nextSide,
    chainCell: null,
    moveCount: game.moveCount + 1,
    lastMove: { from, to },
    updatedAt: new Date().toISOString(),
  };
}

export function countCheckersPieces(board: number[]): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  for (const cell of board) {
    if (cell === 1 || cell === 3) p1++;
    else if (cell === 2 || cell === 4) p2++;
  }
  return { p1, p2 };
}
