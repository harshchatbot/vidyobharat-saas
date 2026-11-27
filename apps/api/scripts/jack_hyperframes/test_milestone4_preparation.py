from decimal import Decimal
from pathlib import Path

from milestone4_preparation import BENCHMARKS, capability_matrix, cost_report, pricing_file, production_audit


def test_final_plan_has_exactly_two_bounded_benchmarks():
    assert set(BENCHMARKS) == {"A", "B"}
    assert {item["duration_seconds"] for item in BENCHMARKS.values()} == {30, 60}


def test_capability_matrix_has_38_unscored_rows(tmp_path):
    matrix = capability_matrix(tmp_path)
    assert matrix["capability_count"] == 38
    assert matrix["final_gate"].startswith("blocked")
    assert all(row["score"] is None for row in matrix["capabilities"])


def test_cost_report_uses_existing_enforced_preflight(tmp_path):
    pricing = tmp_path / "pricing.json"
    pricing_file(pricing)
    report = cost_report(tmp_path, pricing)
    assert Decimal(report["combined"]["enforced_maximum_usd"]) <= Decimal("20")
    assert report["combined"]["recommended_approved_spend_usd"] == "20.00"
    assert all(item["budget_enforcement"]["sdk_retries"] == 0 for item in report["benchmarks"].values())


def test_audit_names_only_final_in_scope_corrections():
    audit = production_audit()
    assert audit["entry_point"] == "run_faceless.py"
    assert len(audit["offline_integration_corrections"]) == 5
    assert "Final 38-capability acceptance" in audit["limitations"]
