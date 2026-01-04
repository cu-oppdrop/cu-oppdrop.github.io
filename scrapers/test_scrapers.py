#!/usr/bin/env python3
"""Tests for scraper functions."""
import sys
from pathlib import Path

# Import from scrapers
from urf_scraper import parse_deadline, generate_tags
from mei_scraper import generate_id, normalize_url

def test_parse_deadline():
    """Test deadline parsing."""
    tests = [
        ("Deadline: January 15, 2025", "2025-01-15"),
        ("Due March 6th, 2025", "2025-03-06"),
        ("Applications close April 1, 2025", "2025-04-01"),
        ("Apply by February 28, 2025", "2025-02-28"),
        ("04/15/2025", "2025-04-15"),
        ("2025-06-01", "2025-06-01"),
        ("No date here", None),
        ("", None),
    ]

    passed = 0
    for text, expected in tests:
        iso, _ = parse_deadline(text)
        if iso == expected:
            passed += 1
            print(f"  PASS: '{text[:40]}' -> {iso}")
        else:
            print(f"  FAIL: '{text[:40]}' -> {iso} (expected {expected})")

    return passed, len(tests)


def test_generate_tags():
    """Test tag generation."""
    tests = [
        ("undergraduate students", {"level": ["undergraduate"]}),
        ("graduate fellowship", {"level": ["graduate"], "type": ["fellowship"]}),
        ("research grant", {"type": ["research", "grant"]}),
        ("international students", {"citizenship": ["international"]}),
        ("US citizens only", {"citizenship": ["us_citizen"]}),
        ("who are not US citizens", {"citizenship": ["international"]}),
    ]

    passed = 0
    for text, expected_contains in tests:
        tags = generate_tags(text)
        ok = True
        for key, values in expected_contains.items():
            for v in values:
                if v not in tags.get(key, []):
                    ok = False
                    print(f"  FAIL: '{text}' missing {key}={v}, got {tags}")
                    break
            if not ok:
                break
        if ok:
            passed += 1
            print(f"  PASS: '{text[:40]}'")

    return passed, len(tests)


def test_generate_id():
    """Test ID generation is stable and unique."""
    id1 = generate_id("Test Fellowship", "URF")
    id2 = generate_id("Test Fellowship", "URF")
    id3 = generate_id("Different Fellowship", "URF")

    passed = 0
    total = 2

    if id1 == id2:
        passed += 1
        print(f"  PASS: Same input -> same ID")
    else:
        print(f"  FAIL: Same input -> different IDs: {id1} vs {id2}")

    if id1 != id3:
        passed += 1
        print(f"  PASS: Different input -> different ID")
    else:
        print(f"  FAIL: Different input -> same ID")

    return passed, total


def test_data_integrity():
    """Test the generated data file."""
    import json
    data_file = Path(__file__).parent.parent / "data" / "opportunities.json"

    if not data_file.exists():
        print(f"  SKIP: {data_file} not found")
        return 0, 0

    with open(data_file) as f:
        opps = json.load(f)

    errors = []

    if len(opps) < 10:
        errors.append(f"Too few opportunities: {len(opps)}")

    ids = []
    for opp in opps:
        if not opp.get("id"):
            errors.append(f"Missing ID: {opp.get('name', 'unknown')}")
        else:
            ids.append(opp["id"])
        if not opp.get("name"):
            errors.append(f"Missing name: {opp.get('id', 'unknown')}")
        if not opp.get("url"):
            errors.append(f"Missing URL: {opp.get('name', 'unknown')}")
        if opp.get("deadline") and len(opp["deadline"]) != 10:
            errors.append(f"Bad deadline format: {opp['deadline']}")

    # Check duplicates
    if len(ids) != len(set(ids)):
        errors.append("Duplicate IDs found")

    if errors:
        for e in errors[:5]:  # Show first 5
            print(f"  FAIL: {e}")
        return 0, 1

    print(f"  PASS: {len(opps)} opportunities validated")
    return 1, 1


def main():
    print("\n=== Scraper Tests ===\n")

    total_passed = 0
    total_tests = 0

    print("parse_deadline:")
    p, t = test_parse_deadline()
    total_passed += p
    total_tests += t

    print("\ngenerate_tags:")
    p, t = test_generate_tags()
    total_passed += p
    total_tests += t

    print("\ngenerate_id:")
    p, t = test_generate_id()
    total_passed += p
    total_tests += t

    print("\ndata_integrity:")
    p, t = test_data_integrity()
    total_passed += p
    total_tests += t

    print(f"\n{'='*30}")
    print(f"Results: {total_passed}/{total_tests} passed")

    return 0 if total_passed == total_tests else 1


if __name__ == "__main__":
    sys.exit(main())
