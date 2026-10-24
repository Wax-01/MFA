"""Caché anti-replay en memoria: (user_id, código) usados en los últimos REPLAY_TTL_S segundos.

90 s cubre las tres ventanas aceptadas (C-1, C, C+1), así un código no puede reutilizarse
mientras siga siendo matemáticamente válido.
"""
import threading
import time


class AntiReplayCache:
    def __init__(self, ttl_s: int):
        self._ttl_s = ttl_s
        self._used: dict[tuple[int, str], float] = {}
        self._lock = threading.Lock()

    def _purge(self, now: float) -> None:
        for key in [k for k, expires in self._used.items() if expires <= now]:
            del self._used[key]

    def was_used(self, user_id: int, code: str) -> bool:
        with self._lock:
            self._purge(time.monotonic())
            return (user_id, code) in self._used

    def mark_used(self, user_id: int, code: str) -> bool:
        """Registra el código de forma atómica. False si otra petición concurrente lo registró primero."""
        with self._lock:
            now = time.monotonic()
            self._purge(now)
            if (user_id, code) in self._used:
                return False
            self._used[(user_id, code)] = now + self._ttl_s
            return True
