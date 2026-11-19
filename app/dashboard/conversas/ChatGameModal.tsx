'use client';

import { useEffect, useMemo, useState } from 'react';
import { Crown, Flag, Gamepad2, RotateCcw, Trophy, X } from 'lucide-react';
import { primaryActionStyle } from '@/app/components/BrandMark';
import {
  C4_COLS,
  C4_ROWS,
  countCheckersPieces,
  gameLabel,
  getCheckersLegalMoves,
  playCheckersMove,
  playConnect4Move,
  playTicTacToeMove,
  playerSide,
  rematchGame,
  resignGame,
  type ChatGameState,
} from '@/app/lib/chatGames';

interface ChatGameModalProps {
  open: boolean;
  game: ChatGameState | null;
  currentUserId: string;
  busy?: boolean;
  onClose: () => void;
  onUpdateGame: (next: ChatGameState) => Promise<void>;
}

export default function ChatGameModal({
  open,
  game,
  currentUserId,
  busy = false,
  onClose,
  onUpdateGame,
}: ChatGameModalProps) {
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const side = game ? playerSide(game, currentUserId) : null;
  const isMyTurn = Boolean(game && game.status === 'playing' && side && game.turn === side);

  const checkersLegalMoves = useMemo(() => {
    if (!game || game.kind !== 'checkers' || game.status !== 'playing') return [];
    return getCheckersLegalMoves(game.board, game.turn, game.chainCell);
  }, [game]);

  const effectiveSelectedCell = useMemo(() => {
    if (!game || game.kind !== 'checkers' || !isMyTurn) return null;
    if (typeof game.chainCell === 'number') return game.chainCell;
    if (selectedCell !== null && checkersLegalMoves.some((m) => m.from === selectedCell)) {
      return selectedCell;
    }
    return null;
  }, [game, isMyTurn, selectedCell, checkersLegalMoves]);

  if (!open || !game) return null;

  const p1Name = game.challenger.name.split(' ')[0];
  const p2Name = game.opponent?.name.split(' ')[0] || 'Aguardando...';
  const isParticipant = side !== null;
  const activePlayerName = game.turn === 'p1' ? p1Name : p2Name;

  const statusText =
    game.status === 'waiting'
      ? 'Aguardando oponente aceitar o desafio…'
      : game.status === 'declined'
        ? 'Desafio recusado.'
        : game.status === 'finished'
          ? game.winner === 'draw'
            ? 'Empate!'
            : `Vitória de ${game.winner === 'p1' ? game.challenger.name : game.opponent?.name || 'Oponente'}!`
          : isMyTurn
            ? game.kind === 'checkers' && typeof game.chainCell === 'number'
              ? 'Sua vez · Continue a captura múltipla!'
              : 'Sua vez de jogar!'
            : `Aguardando jogada de ${activePlayerName}…`;

  const checkersCounts = game.kind === 'checkers' ? countCheckersPieces(game.board) : null;
  const checkersMustCapture =
    game.kind === 'checkers' && isMyTurn && checkersLegalMoves.some((m) => typeof m.captured === 'number');

  const handleTicTacToeClick = (cell: number) => {
    if (busy || !isMyTurn) return;
    const next = playTicTacToeMove(game, currentUserId, cell);
    if (next) void onUpdateGame(next);
  };

  const handleConnect4Column = (col: number) => {
    if (busy || !isMyTurn) return;
    const next = playConnect4Move(game, currentUserId, col);
    if (next) void onUpdateGame(next);
  };

  const handleCheckersCellClick = (idx: number) => {
    if (busy || !isMyTurn) return;
    // If a piece is selected and the clicked square is a valid destination, execute the move
    if (effectiveSelectedCell !== null) {
      const move = checkersLegalMoves.find((m) => m.from === effectiveSelectedCell && m.to === idx);
      if (move) {
        const next = playCheckersMove(game, currentUserId, move.from, move.to);
        setSelectedCell(null);
        if (next) void onUpdateGame(next);
        return;
      }
    }
    // Otherwise select this piece if it has at least one legal move
    if (checkersLegalMoves.some((m) => m.from === idx)) {
      setSelectedCell(idx);
    } else {
      setSelectedCell(null);
    }
  };

  const validDestinations = new Set(
    effectiveSelectedCell !== null
      ? checkersLegalMoves.filter((m) => m.from === effectiveSelectedCell).map((m) => m.to)
      : []
  );
  const movableOrigins = new Set(isMyTurn ? checkersLegalMoves.map((m) => m.from) : []);

  // Rotate Checkers perspective for Player 2 so both players always advance upward
  const checkersDisplayIndices =
    side === 'p2' ? Array.from({ length: 64 }, (_, i) => 63 - i) : Array.from({ length: 64 }, (_, i) => i);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Partida de ${gameLabel(game.kind)}`}
      onClick={onClose}
      className="fixed inset-0 z-[10020] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-2xl border overflow-hidden flex flex-col max-h-[92dvh]"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-input)',
          boxShadow: '0 24px 60px rgb(15 23 42 / 0.35)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-input)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--tab-active) 12%, var(--bg-card))',
                color: 'var(--tab-active)',
              }}
            >
              <Gamepad2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold tracking-tight truncate">{gameLabel(game.kind)}</h3>
              <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                Partida ao vivo no chat · {game.moveCount} {game.moveCount === 1 ? 'jogada' : 'jogadas'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar jogo"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Placar / Jogadores */}
        <div
          className="px-5 py-3.5 border-b grid grid-cols-2 gap-2.5"
          style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-page)' }}
        >
          <div
            className="px-3 py-2 rounded-xl border flex items-center justify-between gap-2 transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor:
                game.status === 'playing' && game.turn === 'p1'
                  ? 'var(--tab-active)'
                  : 'var(--border-input)',
              boxShadow:
                game.status === 'playing' && game.turn === 'p1'
                  ? '0 0 0 2px color-mix(in srgb, var(--tab-active) 18%, transparent)'
                  : undefined,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {game.kind === 'tictactoe' ? 'X' : '1'}
              </span>
              <span className="text-xs font-bold truncate">
                {p1Name}
                {side === 'p1' ? ' (Você)' : ''}
              </span>
            </div>
            {checkersCounts && (
              <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {checkersCounts.p1}
              </span>
            )}
          </div>

          <div
            className="px-3 py-2 rounded-xl border flex items-center justify-between gap-2 transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor:
                game.status === 'playing' && game.turn === 'p2'
                  ? '#f59e0b'
                  : 'var(--border-input)',
              boxShadow:
                game.status === 'playing' && game.turn === 'p2'
                  ? '0 0 0 2px rgb(245 158 11 / 0.22)'
                  : undefined,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {game.kind === 'tictactoe' ? 'O' : '2'}
              </span>
              <span className="text-xs font-bold truncate">
                {p2Name}
                {side === 'p2' ? ' (Você)' : ''}
              </span>
            </div>
            {checkersCounts && (
              <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {checkersCounts.p2}
              </span>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-center">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border"
            style={
              game.status === 'finished'
                ? {
                    backgroundColor: 'color-mix(in srgb, #10b981 12%, var(--bg-card))',
                    borderColor: 'color-mix(in srgb, #10b981 35%, var(--border-input))',
                    color: '#059669',
                  }
                : isMyTurn
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--tab-active) 11%, var(--bg-card))',
                      borderColor: 'color-mix(in srgb, var(--tab-active) 35%, var(--border-input))',
                      color: 'var(--tab-active)',
                    }
                  : {
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border-input)',
                      color: 'var(--text-muted)',
                    }
            }
          >
            {game.status === 'finished' && <Trophy className="w-3.5 h-3.5" />}
            <span>{statusText}</span>
          </div>
        </div>

        {checkersMustCapture && (
          <p className="text-center text-[11px] font-semibold px-5 pb-1" style={{ color: 'var(--warning)' }}>
            Captura obrigatória disponível — selecione uma peça destacada.
          </p>
        )}

        {/* Tabuleiro */}
        <div className="p-5 flex items-center justify-center overflow-y-auto">
          {game.kind === 'tictactoe' && (
            <div className="grid grid-cols-3 gap-2.5 w-full max-w-[290px]">
              {game.board.map((cell, idx) => {
                const isWin = Boolean(game.winCells?.includes(idx));
                const canClick = isMyTurn && cell === 0 && !busy;
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Casa ${idx + 1}${cell === 1 ? ' X' : cell === 2 ? ' O' : ' vazia'}`}
                    disabled={!canClick}
                    onClick={() => handleTicTacToeClick(idx)}
                    className={`aspect-square rounded-2xl border text-4xl font-black flex items-center justify-center transition-all ${
                      canClick ? 'cursor-pointer hover:scale-[1.03] active:scale-95' : 'cursor-default'
                    }`}
                    style={{
                      backgroundColor: isWin
                        ? 'color-mix(in srgb, #10b981 18%, var(--bg-card))'
                        : 'var(--bg-input)',
                      borderColor: isWin
                        ? '#10b981'
                        : game.lastMove?.to === idx
                          ? 'var(--tab-active)'
                          : 'var(--border-input)',
                      color: cell === 1 ? '#2563eb' : cell === 2 ? '#f59e0b' : 'transparent',
                    }}
                  >
                    {cell === 1 ? '✕' : cell === 2 ? '◯' : ''}
                  </button>
                );
              })}
            </div>
          )}

          {game.kind === 'connect4' && (
            <div
              className="p-3 rounded-2xl border w-full max-w-[360px]"
              style={{
                backgroundColor: '#1e3a8a',
                borderColor: '#1d4ed8',
                boxShadow: 'inset 0 2px 10px rgb(0 0 0 / 0.25)',
              }}
            >
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: C4_ROWS * C4_COLS }, (_, idx) => {
                  const col = idx % C4_COLS;
                  const cell = game.board[idx];
                  const isWin = Boolean(game.winCells?.includes(idx));
                  const colHasSpace = game.board[col] === 0;
                  const canDrop = isMyTurn && colHasSpace && !busy;
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`Coluna ${col + 1}`}
                      disabled={!canDrop}
                      onClick={() => handleConnect4Column(col)}
                      className={`aspect-square rounded-full flex items-center justify-center transition-transform ${
                        canDrop ? 'cursor-pointer hover:scale-105' : 'cursor-default'
                      }`}
                      style={{
                        backgroundColor:
                          cell === 1 ? '#38bdf8' : cell === 2 ? '#fbbf24' : 'rgb(15 23 42 / 0.55)',
                        boxShadow: isWin
                          ? '0 0 0 3px #ffffff, 0 0 12px #ffffff'
                          : cell !== 0
                            ? 'inset 0 -3px 6px rgb(0 0 0 / 0.28)'
                            : 'inset 0 2px 5px rgb(0 0 0 / 0.45)',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {game.kind === 'checkers' && (
            <div
              className="grid grid-cols-8 w-full max-w-[352px] aspect-square rounded-xl overflow-hidden border-2"
              style={{ borderColor: 'var(--border-input)' }}
            >
              {checkersDisplayIndices.map((idx) => {
                const row = Math.floor(idx / 8);
                const col = idx % 8;
                const isDark = (row + col) % 2 === 1;
                const piece = game.board[idx];
                const isSelected = effectiveSelectedCell === idx;
                const isDest = validDestinations.has(idx);
                const isMovable = movableOrigins.has(idx);
                const isLast = game.lastMove?.from === idx || game.lastMove?.to === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Casa ${row + 1}-${col + 1}`}
                    disabled={!isDark || !isMyTurn || busy}
                    onClick={() => handleCheckersCellClick(idx)}
                    className={`relative aspect-square flex items-center justify-center transition-colors ${
                      isDark && isMyTurn && (isMovable || isDest) ? 'cursor-pointer' : 'cursor-default'
                    }`}
                    style={{
                      backgroundColor: !isDark
                        ? '#f1f5f9'
                        : isSelected
                          ? '#2563eb'
                          : isDest
                            ? '#059669'
                            : isLast
                              ? '#475569'
                              : '#334155',
                    }}
                  >
                    {isDest && piece === 0 && (
                      <span className="w-3 h-3 rounded-full bg-white/85 shadow" />
                    )}
                    {piece !== 0 && (
                      <span
                        className={`w-[78%] h-[78%] rounded-full flex items-center justify-center border-2 transition-transform ${
                          isSelected ? 'scale-110' : isMovable ? 'hover:scale-105' : ''
                        }`}
                        style={{
                          backgroundColor: piece === 1 || piece === 3 ? '#2563eb' : '#f59e0b',
                          borderColor:
                            isMovable && checkersMustCapture
                              ? '#fef08a'
                              : piece === 1 || piece === 3
                                ? '#93c5fd'
                                : '#fde68a',
                          boxShadow: '0 2px 5px rgb(0 0 0 / 0.38)',
                        }}
                      >
                        {(piece === 3 || piece === 4) && <Crown className="w-3.5 h-3.5 text-white drop-shadow" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="px-5 py-3.5 border-t flex items-center justify-between gap-2"
          style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-page)' }}
        >
          {isParticipant && game.status === 'playing' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpdateGame(resignGame(game, currentUserId))}
              className="px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-[var(--error-text)] hover:bg-red-500/10 transition-colors"
              style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
            >
              <Flag className="w-3.5 h-3.5" />
              Desistir
            </button>
          ) : isParticipant && game.status === 'finished' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpdateGame(rematchGame(game))}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:brightness-105 transition-all"
              style={primaryActionStyle}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Revanche
            </button>
          ) : (
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {isParticipant ? 'Convite ativo' : 'Modo espectador'}
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
            style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
          >
            Minimizar
          </button>
        </div>
      </div>
    </div>
  );
}
