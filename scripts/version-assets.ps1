$ErrorActionPreference = "Stop"

$version = Get-Date -Format "yyyyMMddHHmmss"
$root = Split-Path -Parent $PSScriptRoot

$filesToPatch = @(
  (Join-Path $root "public\index.html"),
  (Join-Path $root "public\generador-pdf.html"),
  (Join-Path $root "index.html"),
  (Join-Path $root "public\app.js"),
  (Join-Path $root "app.js"),
  (Join-Path $root "public\fan.js"),
  (Join-Path $root "fan.js"),
  (Join-Path $root "public\media.js"),
  (Join-Path $root "media.js")
)

foreach ($file in $filesToPatch) {
  if (-not (Test-Path $file)) { continue }

  $content = Get-Content -Raw -LiteralPath $file -Encoding UTF8
  $updated = $content `
    -replace 'styles\.css\?v=[A-Za-z0-9._-]+', "styles.css?v=$version" `
    -replace 'app\.js\?v=[A-Za-z0-9._-]+', "app.js?v=$version" `
    -replace 'sw\.js\?v=[A-Za-z0-9._-]+', "sw.js?v=$version"

  if ($updated -ne $content) {
    Set-Content -LiteralPath $file -Value $updated -NoNewline -Encoding UTF8
    Write-Host "Versionado actualizado: $($file.Replace($root + '\', '')) -> $version"
  }
}
