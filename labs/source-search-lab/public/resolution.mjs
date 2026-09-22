function activeFindings(scan) {
  return (scan?.findings ?? []).filter(
    (finding) => finding.classification !== "insufficient_evidence",
  );
}

export function analyzeRescanResolution(previousScan, nextScan) {
  if (!previousScan || !nextScan) return { resolved: [], unverified: [] };
  if (previousScan.repository?.name !== nextScan.repository?.name) {
    return { resolved: [], unverified: [] };
  }
  if (previousScan.repository?.commit === nextScan.repository?.commit) {
    return { resolved: [], unverified: [] };
  }

  const nextIds = new Set(activeFindings(nextScan).map((finding) => finding.id));
  const checkedFiles = new Set(nextScan.scan?.checkedFiles ?? []);
  const supportedFilesInTree = new Set(nextScan.scan?.supportedFilesInTree ?? []);
  const treeComplete = nextScan.scan?.treeComplete === true;

  const resolved = [];
  const unverified = [];

  for (const finding of activeFindings(previousScan)) {
    if (nextIds.has(finding.id)) continue;

    const path = finding.customer?.path;
    const fileWasChecked = Boolean(path) && checkedFiles.has(path);
    const fileWasConfirmedDeleted =
      Boolean(path) &&
      treeComplete &&
      !supportedFilesInTree.has(path);

    if (fileWasChecked || fileWasConfirmedDeleted) {
      resolved.push(finding);
    } else {
      unverified.push(finding);
    }
  }

  return { resolved, unverified };
}
