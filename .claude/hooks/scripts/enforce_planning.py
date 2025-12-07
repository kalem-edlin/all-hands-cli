#!/usr/bin/env python3
"""UserPromptSubmit hook - enforces planning workflow based on plan status."""

import json
import subprocess
import sys
from pathlib import Path


def get_envoy_path() -> Path:
    """Get path to envoy CLI."""
    cwd = Path.cwd()
    return cwd / ".claude" / "envoy" / "envoy"


def get_plan_status() -> dict:
    """Get current plan status via envoy."""
    envoy = get_envoy_path()
    if not envoy.exists():
        return {"error": "envoy not found"}

    result = subprocess.run(
        [str(envoy), "plans", "frontmatter"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return {"error": result.stderr}

    try:
        data = json.loads(result.stdout)
        return data.get("data", {})
    except json.JSONDecodeError:
        return {"error": "invalid json"}


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        return

    # Get plan status
    plan_data = get_plan_status()

    # Direct mode - no planning enforcement
    if plan_data.get("mode") == "direct":
        return

    # No plan exists yet
    if not plan_data.get("exists"):
        print("<system-reminder>")
        print("BLOCKING: No plan file exists. You MUST run /plan IMMEDIATELY.")
        print("</system-reminder>")
        return

    frontmatter = plan_data.get("frontmatter", {})
    status = frontmatter.get("status", "draft")
    plan_path = plan_data.get("path", "")

    if status == "draft":
        print("<system-reminder>")
        print(f"BLOCKING: Plan status is draft. You MUST run /plan IMMEDIATELY.")
        print(f"Plan: {plan_path}")
        print("</system-reminder>")

    elif status == "active":
        print("<system-reminder>")
        print(f"ACTIVE PLAN: {plan_path}")
        print("If plan not in context, read it first. If prompt unrelated to plan, run /plan.")
        print("</system-reminder>")

    elif status == "deactivated":
        # User opted out - no enforcement, silent pass
        return


if __name__ == "__main__":
    main()