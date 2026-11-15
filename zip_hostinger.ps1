$serverZip = "D:\pizza-shop-employe-mangement\hostinger_server_update.zip"
if (Test-Path $serverZip) { Remove-Item $serverZip -Force }

$serverFiles = @(
  "D:\pizza-shop-employe-mangement\server\server.js",
  "D:\pizza-shop-employe-mangement\server\package.json",
  "D:\pizza-shop-employe-mangement\server\db.js",
  "D:\pizza-shop-employe-mangement\server\migrate_complete_system_updates.js",
  "D:\pizza-shop-employe-mangement\server\migrate_internal_branch_schema.js",
  "D:\pizza-shop-employe-mangement\server\run_hostinger_migration.js",
  "D:\pizza-shop-employe-mangement\server\middleware",
  "D:\pizza-shop-employe-mangement\server\routes",
  "D:\pizza-shop-employe-mangement\server\cron",
  "D:\pizza-shop-employe-mangement\server\utils"
)

Compress-Archive -Path $serverFiles -DestinationPath $serverZip -Force

$distZip = "D:\pizza-shop-employe-mangement\hostinger_client_dist.zip"
if (Test-Path $distZip) { Remove-Item $distZip -Force }
Compress-Archive -Path "D:\pizza-shop-employe-mangement\client\dist\*" -DestinationPath $distZip -Force

Write-Host "Server zip size:" (Get-Item $serverZip).Length
Write-Host "Dist zip size:" (Get-Item $distZip).Length

