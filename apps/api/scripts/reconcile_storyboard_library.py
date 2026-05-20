#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Reconcile storyboard video library record from existing final_video_url (no generation calls).",
    )
    parser.add_argument("--project-id", required=True, help="Storyboard project id")
    args = parser.parse_args()

    # Ensure imports resolve when script is run from apps/api
    sys.path.insert(0, os.path.abspath("."))

    from app.services.storyboard_library_reconcile_service import StoryboardLibraryReconcileService

    service = StoryboardLibraryReconcileService()
    result = service.reconcile_project(args.project_id)
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

