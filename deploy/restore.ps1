param([Parameter(Mandatory)][string]$Container,[Parameter(Mandatory)][string]$Archive)
$ErrorActionPreference='Stop'
$docker=(Get-Command docker.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if(!$docker){$docker='docker'}
$source=(Resolve-Path -LiteralPath $Archive).Path
$name='restore_'+[guid]::NewGuid().ToString('N')
$tmp='/tmp/'+$name+'.dump'
try{
 & $docker cp $source ("${Container}:"+$tmp)
 if($LASTEXITCODE){throw 'Copy failed'}
 & $docker exec $Container createdb -U travelmap $name
 if($LASTEXITCODE){throw 'Creating recovery database failed'}
 & $docker exec $Container pg_restore -U travelmap -d $name --single-transaction --no-owner --no-acl $tmp
 if($LASTEXITCODE){throw "Restore failed in $name"}
 Write-Output $name
}finally{& $docker exec $Container rm -f $tmp | Out-Null}
