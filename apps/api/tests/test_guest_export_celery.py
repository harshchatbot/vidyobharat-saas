from __future__ import annotations

from app.workers import guest_export_tasks


def test_guest_export_task_reuses_durable_worker(monkeypatch) -> None:
    calls: list[str] = []

    class Worker:
        def run_job(self, *, guest_id: str, job_id: str) -> bool:
            calls.append(f'{guest_id}:{job_id}')
            return True

    monkeypatch.setattr(guest_export_tasks, 'build_guest_export_worker', lambda: Worker())

    assert guest_export_tasks.process_guest_timeline_export.run('guest-1', 'a' * 32) is True
    assert calls == [f"guest-1:{'a' * 32}"]


def test_guest_export_reconciliation_drains_until_no_work(monkeypatch) -> None:
    outcomes = iter((True, True, False))

    class Worker:
        def run_once(self) -> bool:
            return next(outcomes)

    monkeypatch.setattr(guest_export_tasks, 'build_guest_export_worker', lambda: Worker())

    assert guest_export_tasks.reconcile_guest_timeline_exports.run(max_jobs=8) == 2
