cd $PSScriptRoot\backend
Write-Host "Resuming artist batch (collect + preprocess). Leave this window open." -ForegroundColor Cyan
node scripts/ingestBatch.js 2>&1 | Tee-Object -FilePath ..\ingest-batch-out.log -Append
Write-Host "Batch finished. You can close this window." -ForegroundColor Green
Read-Host "Press Enter to close"
