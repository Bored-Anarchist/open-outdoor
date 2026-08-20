[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$rulesetPath = Join-Path $repositoryRoot '.github/rulesets/main.json'
if (-not (Test-Path -LiteralPath $rulesetPath -PathType Leaf)) {
    throw "Ruleset payload not found: $rulesetPath"
}

if (-not $PSCmdlet.ShouldProcess($Repository, 'Enable public repository controls and replace the protect-main ruleset')) {
    return
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is required.'
}

& gh auth status
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI is not authenticated.'
}

& gh api --method PATCH "repos/$Repository" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' -F has_issues=true -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to configure repository merge and issue settings.' }

& gh api --method PUT "repos/$Repository/actions/permissions/workflow" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to configure default GitHub Actions permissions.' }

& gh api --method PUT "repos/$Repository/private-vulnerability-reporting" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to enable private vulnerability reporting.' }

$existingRulesets = & gh api "repos/$Repository/rulesets" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10'
if ($LASTEXITCODE -ne 0) { throw 'Failed to read repository rulesets.' }
$existing = $existingRulesets | ConvertFrom-Json | Where-Object { $_.name -eq 'protect-main' } | Select-Object -First 1
if ($null -eq $existing) {
    & gh api --method POST "repos/$Repository/rulesets" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' --input $rulesetPath | Out-Null
}
else {
    & gh api --method PUT "repos/$Repository/rulesets/$($existing.id)" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' --input $rulesetPath | Out-Null
}
if ($LASTEXITCODE -ne 0) { throw 'Failed to apply protect-main ruleset.' }

Write-Host "Repository controls applied to $Repository. Verify the documentation-integrity check on a test pull request before accepting WP-001."
