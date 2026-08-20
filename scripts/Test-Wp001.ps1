[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure {
    param([Parameter(Mandatory)][string]$Message)
    $failures.Add($Message)
}

function Read-RepositoryFile {
    param([Parameter(Mandatory)][string]$RelativePath)
    $absolutePath = Join-Path $repositoryRoot $RelativePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
        Add-Failure "Missing required file: $RelativePath"
        return ''
    }

    $item = Get-Item -LiteralPath $absolutePath
    if ($item.Length -eq 0) {
        Add-Failure "Required file is empty: $RelativePath"
        return ''
    }

    return Get-Content -Raw -LiteralPath $absolutePath
}

$requiredFiles = @(
    '.gitignore',
    'README.md',
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY_NOTICES.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'GOVERNANCE.md',
    'SECURITY.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.github/ISSUE_TEMPLATE/bug-report.yml',
    '.github/ISSUE_TEMPLATE/work-package.yml',
    '.github/ISSUE_TEMPLATE/scope-proposal.yml',
    '.github/workflows/documentation-integrity.yml',
    '.github/rulesets/main.json',
    'docs/REPOSITORY_CONTROLS.md',
    'docs/evidence/WP-001.md'
)

$contents = @{}
foreach ($relativePath in $requiredFiles) {
    $contents[$relativePath] = Read-RepositoryFile $relativePath
}

$gitignore = $contents['.gitignore']
foreach ($requiredPattern in @('.env', '.private/', 'private/', 'secrets/', 'credentials/', '*.key', '*.p12', '*.mobileprovision')) {
    if ($gitignore -notmatch ('(?m)^' + [regex]::Escape($requiredPattern) + '\r?$')) {
        Add-Failure ".gitignore is missing the public-boundary pattern: $requiredPattern"
    }
}

$license = $contents['LICENSE']
foreach ($expectedText in @('Apache License', 'Version 2.0, January 2004', 'END OF TERMS AND CONDITIONS')) {
    if ($license -notmatch [regex]::Escape($expectedText)) {
        Add-Failure "LICENSE is missing canonical Apache-2.0 text: $expectedText"
    }
}

$notice = $contents['NOTICE']
if ($notice -notmatch 'Open Outdoor' -or $notice -notmatch 'THIRD_PARTY_NOTICES\.md') {
    Add-Failure 'NOTICE must identify Open Outdoor and point to THIRD_PARTY_NOTICES.md.'
}

$thirdPartyNotices = $contents['THIRD_PARTY_NOTICES.md']
foreach ($expectedText in @('license or permission basis', 'required attribution', 'software bill of materials', 'data/asset bill of materials')) {
    if ($thirdPartyNotices -notmatch [regex]::Escape($expectedText)) {
        Add-Failure "THIRD_PARTY_NOTICES.md is missing required provenance guidance: $expectedText"
    }
}

$attestation = "I have the right to submit this contribution, and I license it under the repository's stated contribution terms."
foreach ($relativePath in @('CONTRIBUTING.md', '.github/PULL_REQUEST_TEMPLATE.md')) {
    if ($contents[$relativePath] -notmatch [regex]::Escape($attestation)) {
        Add-Failure "$relativePath is missing the exact account-bound contribution attestation."
    }
}

$pullRequestTemplate = $contents['.github/PULL_REQUEST_TEMPLATE.md']
if ($pullRequestTemplate -match '(?im)^\s*-\s*\[[ xX]\].*Signed-off-by') {
    Add-Failure 'The pull-request template must not request a public DCO Signed-off-by identity line.'
}

foreach ($relativePath in @(
    '.github/ISSUE_TEMPLATE/bug-report.yml',
    '.github/ISSUE_TEMPLATE/work-package.yml',
    '.github/ISSUE_TEMPLATE/scope-proposal.yml'
)) {
    $template = $contents[$relativePath]
    if ($template -notmatch 'SECURITY\.md' -and $relativePath -ne '.github/ISSUE_TEMPLATE/scope-proposal.yml') {
        Add-Failure "$relativePath must route sensitive reports to SECURITY.md."
    }
    if ($template -notmatch '(?m)^\s*required:\s*true\s*$') {
        Add-Failure "$relativePath must contain required public-boundary fields."
    }
    if ($template -match '(?im)^\s*(id|label):\s*(legal[_ -]?name|personal[_ -]?email|home[_ -]?address|phone[_ -]?number|device[_ -]?id|account[_ -]?id)\s*$') {
        Add-Failure "$relativePath requests prohibited identifying information."
    }
}

$workflowDirectory = Join-Path $repositoryRoot '.github/workflows'
if (Test-Path -LiteralPath $workflowDirectory) {
    foreach ($workflow in Get-ChildItem -LiteralPath $workflowDirectory -File |
        Where-Object { $_.Extension -in @('.yml', '.yaml') }) {
        $workflowText = Get-Content -Raw -LiteralPath $workflow.FullName
        if ($workflowText -match '(?m)^\s*pull_request_target\s*:') {
            Add-Failure "$($workflow.Name) uses prohibited pull_request_target execution."
        }
        if ($workflowText -match '(?m)^\s*schedule\s*:') {
            Add-Failure "$($workflow.Name) adds an unapproved routine schedule."
        }
        foreach ($match in [regex]::Matches($workflowText, '(?m)^\s*uses:\s*(?<use>[^\s#]+)')) {
            $use = $match.Groups['use'].Value
            if ($use.StartsWith('./')) {
                continue
            }
            if ($use -notmatch '@[0-9a-fA-F]{40}$') {
                Add-Failure "$($workflow.Name) has a third-party action that is not pinned to a full commit SHA: $use"
            }
        }
    }
}

$governanceWorkflow = $contents['.github/workflows/documentation-integrity.yml']
foreach ($pattern in @(
    '(?m)^permissions:\s*\r?\n\s+contents:\s*read\s*$',
    '(?m)^concurrency:\s*$',
    '(?m)^\s+cancel-in-progress:\s*true\s*$',
    '(?m)^\s+timeout-minutes:\s*\d+\s*$'
)) {
    if ($governanceWorkflow -notmatch $pattern) {
        Add-Failure "documentation-integrity.yml is missing least-privilege, cancellation, or timeout control: $pattern"
    }
}

$rulesetPath = Join-Path $repositoryRoot '.github/rulesets/main.json'
if (Test-Path -LiteralPath $rulesetPath -PathType Leaf) {
    try {
        $ruleset = Get-Content -Raw -LiteralPath $rulesetPath | ConvertFrom-Json
        $ruleTypes = @($ruleset.rules | ForEach-Object { $_.type })
        foreach ($requiredRule in @('deletion', 'non_fast_forward', 'required_linear_history', 'pull_request', 'required_status_checks')) {
            if ($requiredRule -notin $ruleTypes) {
                Add-Failure "main ruleset is missing rule: $requiredRule"
            }
        }
        if ($ruleset.enforcement -ne 'active') {
            Add-Failure 'main ruleset must use active enforcement.'
        }
        if (@($ruleset.bypass_actors).Count -ne 0) {
            Add-Failure 'main ruleset must not bypass administrators or other actors.'
        }
        $statusRule = $ruleset.rules | Where-Object { $_.type -eq 'required_status_checks' }
        $requiredContexts = @($statusRule.parameters.required_status_checks | ForEach-Object { $_.context })
        if ('documentation-integrity' -notin $requiredContexts) {
            Add-Failure 'main ruleset must require documentation-integrity at the current head.'
        }
        if (-not $statusRule.parameters.strict_required_status_checks_policy) {
            Add-Failure 'main ruleset status checks must require the current head.'
        }
        $pullRequestRule = $ruleset.rules | Where-Object { $_.type -eq 'pull_request' }
        if (-not $pullRequestRule.parameters.required_review_thread_resolution) {
            Add-Failure 'main ruleset must require resolved review conversations.'
        }
        if ('squash' -notin @($pullRequestRule.parameters.allowed_merge_methods)) {
            Add-Failure 'main ruleset must allow the squash-only merge policy.'
        }
    }
    catch {
        Add-Failure "Unable to parse or validate .github/rulesets/main.json: $($_.Exception.Message)"
    }
}

$markdownFiles = Get-ChildItem -LiteralPath $repositoryRoot -Recurse -File -Filter '*.md' |
    Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' }
foreach ($markdownFile in $markdownFiles) {
    $markdown = Get-Content -Raw -LiteralPath $markdownFile.FullName
    foreach ($match in [regex]::Matches($markdown, '\[[^\]]+\]\((?<target>[^)\s]+)')) {
        $target = $match.Groups['target'].Value.Trim('<', '>')
        if ($target -match '^(https?://|mailto:|#)') {
            continue
        }
        $fileTarget = ($target -split '#', 2)[0]
        if ([string]::IsNullOrWhiteSpace($fileTarget)) {
            continue
        }
        $decodedTarget = [System.Uri]::UnescapeDataString($fileTarget)
        $resolvedTarget = Join-Path $markdownFile.DirectoryName $decodedTarget
        if (-not (Test-Path -LiteralPath $resolvedTarget)) {
            $relativeSource = [System.IO.Path]::GetRelativePath($repositoryRoot, $markdownFile.FullName)
            Add-Failure "Broken relative Markdown link in ${relativeSource}: $target"
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Error ("WP-001 governance validation failed:`n - " + ($failures -join "`n - "))
    exit 1
}

Write-Host "WP-001 governance validation passed ($($requiredFiles.Count) required artifacts; policies, templates, workflow, ruleset, and relative links checked)."
