#!/bin/bash
# GitHub Ruleset Setup: Enforce: Main Branch Safety & Quality Gates
# Creates branch protection rules for main branch via GitHub API

set -e

echo "📋 Creating GitHub ruleset for main branch..."

gh api repos/chozzz/vargos/rulesets \
  -X POST \
  --input - << 'EOF'
{
  "name": "Enforce: Main Branch Safety & Quality Gates",
  "description": "Prevents direct commits, requires PR reviews, enforces squash merge, and mandates passing security/quality checks before main merge",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          {"context": "lint-and-typecheck"},
          {"context": "test"},
          {"context": "codeql"}
        ]
      }
    }
  ]
}
EOF

echo "✅ Ruleset created successfully!"
