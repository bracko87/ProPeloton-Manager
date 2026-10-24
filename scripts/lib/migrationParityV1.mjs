/**
 * Snapshot-based migration inventory comparison.
 * A migration file is matched by its numeric Supabase version, never its name.
 * This does NOT attempt to repair or replay mismatched production migrations.
 */
export function compareMigrationHistory(fileNames, appliedVersions) {
  const files = fileNames.filter(name => /^[0-9]{14}_[^/]+\.sql$/.test(name));
  const versionFromFile = name => name.slice(0,14);
  const appliedSet = new Set(appliedVersions.map(String));
  const repoSet = new Set(files.map(versionFromFile));
  const byVersion = new Map();
  for(const name of files){
    const version=versionFromFile(name);
    if(byVersion.has(version))throw Error(`Duplicate local migration version ${version}`);
    byVersion.set(version,name);
  }
  if(appliedSet.size!==appliedVersions.length)throw Error("Duplicate applied migration version");
  const appliedMissingFiles=appliedVersions.filter(v=>!repoSet.has(String(v)));
  const localWithoutApplied=files.filter(name=>!appliedSet.has(versionFromFile(name)));
  const matching=files.filter(name=>appliedSet.has(versionFromFile(name)));
  return {
    productionApplied:appliedVersions.length, repositoryFiles:files.length,
    matching:matching.length, productionVersionsWithoutFile:appliedMissingFiles.length,
    repositoryVersionsNotApplied:localWithoutApplied.length,
    canReplayCompleteHistory:appliedMissingFiles.length===0 && localWithoutApplied.length===0,
    firstMissingAppliedVersions:appliedMissingFiles.slice(0,12),
    firstUnappliedRepositoryFiles:localWithoutApplied.slice(0,12),
  };
}
