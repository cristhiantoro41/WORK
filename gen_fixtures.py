"""Genera fixtures de paridad motor.py -> tests de la PWA (temporal)."""
import json

from motor import Posicion

FENS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
    "8/8/4k3/8/2p5/8/B2P2K1/8 w - - 0 1",
    "8/8/8/8/8/6k1/6p1/6K1 w - - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 0 1",
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    "8/8/8/8/8/8/8/K6k w - - 0 1",
    "7k/5R2/6K1/8/8/8/8/8 w - - 0 1",
    "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1",
    "8/8/8/3k4/8/8/3K1R2/8 w - - 0 1",
]

salida = {}
for fen in FENS:
    pos = Posicion(fen)
    movs = sorted(m.uci for m in pos.movimientos_legales())
    salida[fen] = movs

with open("fixtures_parity.json", "w", encoding="utf-8") as fh:
    json.dump(salida, fh, indent=0, ensure_ascii=False)

print(len(salida), "FEN")
for fen, movs in salida.items():
    print(len(movs), fen)
