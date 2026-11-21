# Saturn baseline capture for Windows PowerShell (no Docker).
# READ ONLY against production. Never uploads or restores anything.
# PostgreSQL 17 client tools must be installed. Password is entered only
# at pg_dump's own hidden prompt; not stored in this script or Git.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$DbHost,
    [Parameter(Mandatory=$true)][string]$DbUser,
    [ValidateRange(1,65535)][int]$DbPort = 5432,
    [string]$DbName = 'postgres',
    [string]$OutputDirectory = (Join-Path $HOME 'SaturnPrivateBaseline')
)
$ErrorActionPreference = 'Stop'
$dump = Get-Command pg_dump -ErrorAction SilentlyContinue
$restore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $dump -or -not $restore) {
    $bin = Join-Path $env:ProgramFiles 'PostgreSQL\17\bin'
    $dumpPath = Join-Path $bin 'pg_dump.exe'
    $restorePath = Join-Path $bin 'pg_restore.exe'
    if (-not (Test-Path -LiteralPath $dumpPath) -or -not (Test-Path -LiteralPath $restorePath)) {
        throw 'Install PostgreSQL 17 command-line tools, then retry. Docker is not required.'
    }
} else {
    $dumpPath = $dump.Source
    $restorePath = $restore.Source
}
if ((& $dumpPath --version) -notmatch 'pg_dump \(PostgreSQL\) 17\.') {
    throw 'Use the PostgreSQL 17 client tools for this baseline.'
}
if ((& $restorePath --version) -notmatch 'pg_restore \(PostgreSQL\) 17\.') {
    throw 'Use the PostgreSQL 17 pg_restore tool for validation.'
}
if ($DbPort -eq 6543) {
    throw 'Use the direct or session-pooler connection, not the transaction pooler.'
}
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\','/')
$target = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\','/')
if ($target.Equals($repoRoot,[StringComparison]::OrdinalIgnoreCase) -or
    $target.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Never create a production schema archive inside the Git checkout.'
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
# Reject reparse points/junctions along the destination path.
$check = Get-Item -LiteralPath $target
while ($null -ne $check) {
    if ($check.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Use a normal local folder, not a junction/symlink.'
    }
    $check = $check.Parent
}
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$final = Join-Path $target "saturn-schema-$stamp.dump"
$partial = "$final.partial"
if ((Test-Path -LiteralPath $final) -or (Test-Path -LiteralPath $partial)) {
    throw 'The output already exists. Stop.'
}
$oldOptions = $env:PGOPTIONS
$oldSslMode = $env:PGSSLMODE
$oldPgPassword = $env:PGPASSWORD
try {
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=120000'
    $env:PGSSLMODE = 'require'
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Write-Host 'Enter the database password only in the PostgreSQL prompt.'
    & $dumpPath --host=$DbHost --port=$DbPort --username=$DbUser --dbname=$DbName --password --schema-only --format=custom --lock-wait-timeout=5s --schema=public --schema=private --schema=finance --schema=archive --schema=control_center_private --schema=v4_historical_research --file=$partial
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed. No completed archive was created.' }
    $toc = & $restorePath --list $partial
    if ($LASTEXITCODE -ne 0) { throw 'Archive validation failed.' }
    if (-not ($toc | Where-Object { $_ -match ' TABLE public clubs ' })) {
        throw 'Archive lacks public.clubs; check the connection target.'
    }
    if (-not ($toc | Where-Object { $_ -match ' FUNCTION public generate_race_prize_awards_v1\(' })) {
        throw 'Archive lacks the original race-prize function.'
    }
    if ($toc | Where-Object { $_ -match ' (TABLE DATA|SEQUENCE SET|BLOB DATA) ' }) {
        throw 'Unexpected data entries; schema-only requirement failed.'
    }
    Move-Item -LiteralPath $partial -Destination $final
    Write-Host ('BASELINE_OK: ' + $final)
    Write-Host ('Bytes: ' + (Get-Item -LiteralPath $final).Length)
    Write-Host 'Keep this archive private. Do not upload it to Git or chat.'
} finally {
    $env:PGOPTIONS = $oldOptions
    $env:PGSSLMODE = $oldSslMode
    $env:PGPASSWORD = $oldPgPassword
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
}
