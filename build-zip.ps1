# Build script: paketerar extension-mappen till en .zip i website/
$source = Join-Path $PSScriptRoot "extension"
$dest   = Join-Path $PSScriptRoot "website\sentinel-extension.zip"

if (Test-Path $dest) { Remove-Item $dest -Force }

Compress-Archive -Path "$source\*" -DestinationPath $dest -Force

Write-Host "Zip skapad: $dest"
