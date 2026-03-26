from typing import Protocol, Iterable

class Scanner(Protocol):
    def scan(self) -> Iterable[dict]: ...
