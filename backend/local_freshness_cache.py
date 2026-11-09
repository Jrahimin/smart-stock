"""Bounded, single-flight cache for the local read-only live-data viewer only."""
import asyncio
from time import monotonic


class LocalFreshnessCache:
    def __init__(self, loader, *, refresh_after=5, max_age=30, clock=monotonic):
        self.loader = loader
        self.refresh_after = refresh_after
        self.max_age = max_age
        self.clock = clock
        self.values = {}
        self.tasks = {}

    async def _load(self, key):
        value = await self.loader(key)
        self.values[key] = (self.clock(), value)
        return value

    def refresh(self, key):
        task = self.tasks.get(key)
        if task is None or task.done():
            task = asyncio.create_task(self._load(key))
            # Observe background errors; expired values still require a successful load.
            task.add_done_callback(lambda done: None if done.cancelled() else done.exception())
            self.tasks[key] = task
        return task

    async def get(self, key):
        entry = self.values.get(key)
        age = self.clock() - entry[0] if entry else float('inf')
        if age >= self.refresh_after:
            task = self.refresh(key)
            if age >= self.max_age:
                return await asyncio.shield(task)
        return entry[1]
