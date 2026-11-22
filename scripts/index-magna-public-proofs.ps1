# Capture a bounded public-discovery sample. Dinn rechecks every candidate proof onchain before showing dates.
$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot '../src/base-magna-escrows.json'
$catalog = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$matched = 0
$checked = 0
foreach ($escrow in $catalog.entries) {
    $url = 'https://base.blockscout.com/api/v2/addresses/' + $escrow.address + '/transactions'
    try {
        $page = Invoke-RestMethod -Uri $url -TimeoutSec 6
    } catch {
        continue
    }
    $checked++
    $hashes = @($page.items | Where-Object {
        $_.to.hash -eq $escrow.address -and $_.status -eq 'ok' -and $_.method -eq 'withdraw' -and
        $_.block_number -le $catalog.throughBlock -and $_.hash -match '^0x[0-9a-fA-F]{64}$'
    } | Select-Object -First 2 -ExpandProperty hash)
    if ($hashes.Count) {
        $escrow | Add-Member -Force -NotePropertyName proofTransactions -NotePropertyValue $hashes
        $matched++
    }
}
if ($checked -eq 0) { throw 'Explorer unavailable; registry was not updated.' }
$json = ConvertTo-Json -InputObject $catalog -Depth 6
[IO.File]::WriteAllText([IO.Path]::GetFullPath($path), $json, [Text.UTF8Encoding]::new($false))
Write-Output "Checked $checked public history pages; $matched escrows supplied candidate hashes."
