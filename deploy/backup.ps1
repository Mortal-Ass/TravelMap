param([Parameter(Mandatory)][string]$Container,[Parameter(Mandatory)][string]$OutputFile,[string]$Database="travelmap")
$ErrorActionPreference='Stop'
$docker=(Get-Command docker.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if(!$docker){$docker='docker'}
$dest=[IO.Path]::GetFullPath($OutputFile)
if(Test-Path -LiteralPath $dest){throw 'Output file already exists'}
$tmp='/tmp/travelmap-'+[guid]::NewGuid().ToString('N')+'.dump'
try{
 & $docker exec $Container pg_dump -U travelmap -d $Database -Fc --no-owner --exclude-table-data=public.sessions --exclude-table-data=public.location_shares --exclude-table-data=public.trip_links -f $tmp
 if($LASTEXITCODE){throw 'pg_dump failed'}
 & $docker exec $Container pg_restore --list $tmp | Out-Null
 if($LASTEXITCODE){throw 'Invalid archive'}
 & $docker cp ("${Container}:"+$tmp) $dest
 if($LASTEXITCODE){throw 'Copy failed'}
 Write-Output $dest
}finally{& $docker exec $Container rm -f $tmp | Out-Null}
