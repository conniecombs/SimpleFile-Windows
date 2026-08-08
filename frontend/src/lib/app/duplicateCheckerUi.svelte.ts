import type {
  DuplicateCheckGroup,
  DuplicateCheckResult,
  PathString,
} from '../types';

export type DuplicateCheckerUiState = {
  candidateFiles: number;
  deleting: boolean;
  directory: PathString;
  errors: string[];
  groups: DuplicateCheckGroup[];
  hashedFiles: number;
  minSize: number;
  scannedFiles: number;
  selectedPaths: Set<PathString>;
  skippedFiles: number;
  totalReclaimableBytes: number;
  visible: boolean;
};

export const duplicateCheckerUi = $state<DuplicateCheckerUiState>({
  candidateFiles: 0,
  deleting: false,
  directory: '',
  errors: [],
  groups: [],
  hashedFiles: 0,
  minSize: 1,
  scannedFiles: 0,
  selectedPaths: new Set<PathString>(),
  skippedFiles: 0,
  totalReclaimableBytes: 0,
  visible: false,
});

export function isDuplicateCheckerVisible() {
  return duplicateCheckerUi.visible;
}

export function openDuplicateCheckerUi(
  directory: PathString,
  result: DuplicateCheckResult,
  minSize: number,
) {
  duplicateCheckerUi.directory = directory;
  duplicateCheckerUi.groups = result.groups || [];
  duplicateCheckerUi.scannedFiles = Number(result.scanned_files || 0);
  duplicateCheckerUi.candidateFiles = Number(result.candidate_files || 0);
  duplicateCheckerUi.hashedFiles = Number(result.hashed_files || 0);
  duplicateCheckerUi.skippedFiles = Number(result.skipped_files || 0);
  duplicateCheckerUi.errors = result.errors || [];
  duplicateCheckerUi.totalReclaimableBytes = Number(result.total_reclaimable_bytes || 0);
  duplicateCheckerUi.minSize = minSize;
  duplicateCheckerUi.selectedPaths = new Set<PathString>();
  duplicateCheckerUi.deleting = false;
  duplicateCheckerUi.visible = true;
}

export function closeDuplicateCheckerUi() {
  duplicateCheckerUi.visible = false;
  duplicateCheckerUi.directory = '';
  duplicateCheckerUi.groups = [];
  duplicateCheckerUi.errors = [];
  duplicateCheckerUi.selectedPaths = new Set<PathString>();
  duplicateCheckerUi.deleting = false;
}

export function setDuplicateCheckerDeleting(deleting: boolean) {
  duplicateCheckerUi.deleting = deleting;
}

function groupForPath(path: PathString) {
  return duplicateCheckerUi.groups.find((group) =>
    group.files.some((file) => file.path === path),
  );
}

function selectedCountForGroup(group: DuplicateCheckGroup, selectedPaths = duplicateCheckerUi.selectedPaths) {
  return group.files.filter((file) => selectedPaths.has(file.path)).length;
}

export function canSelectDuplicatePath(path: PathString) {
  const group = groupForPath(path);
  if (!group) return false;
  if (duplicateCheckerUi.selectedPaths.has(path)) return true;
  return selectedCountForGroup(group) < group.files.length - 1;
}

export function setDuplicatePathSelected(path: PathString, selected: boolean) {
  const group = groupForPath(path);
  if (!group) return false;

  const next = new Set(duplicateCheckerUi.selectedPaths);
  if (selected) {
    next.add(path);
    if (selectedCountForGroup(group, next) >= group.files.length) {
      return false;
    }
  } else {
    next.delete(path);
  }

  duplicateCheckerUi.selectedPaths = next;
  return true;
}

export function clearDuplicateSelections(groupId?: string) {
  if (!groupId) {
    duplicateCheckerUi.selectedPaths = new Set<PathString>();
    return;
  }

  const group = duplicateCheckerUi.groups.find((candidate) => candidate.id === groupId);
  if (!group) return;
  const groupPaths = new Set(group.files.map((file) => file.path));
  duplicateCheckerUi.selectedPaths = new Set(
    [...duplicateCheckerUi.selectedPaths].filter((path) => !groupPaths.has(path)),
  );
}

function selectAllBut(group: DuplicateCheckGroup, keepPath: PathString) {
  const next = new Set(duplicateCheckerUi.selectedPaths);
  for (const file of group.files) {
    if (file.path === keepPath) next.delete(file.path);
    else next.add(file.path);
  }
  duplicateCheckerUi.selectedPaths = next;
}

function newestFilePath(group: DuplicateCheckGroup) {
  return [...group.files].sort((left, right) =>
    String(right.modified || '').localeCompare(String(left.modified || ''))
      || left.path.localeCompare(right.path),
  )[0]?.path;
}

export function selectAllButFirst(groupId?: string) {
  const groups = groupId
    ? duplicateCheckerUi.groups.filter((group) => group.id === groupId)
    : duplicateCheckerUi.groups;
  for (const group of groups) {
    const keepPath = group.files[0]?.path;
    if (keepPath) selectAllBut(group, keepPath);
  }
}

export function selectAllButNewest(groupId?: string) {
  const groups = groupId
    ? duplicateCheckerUi.groups.filter((group) => group.id === groupId)
    : duplicateCheckerUi.groups;
  for (const group of groups) {
    const keepPath = newestFilePath(group);
    if (keepPath) selectAllBut(group, keepPath);
  }
}

export function selectedDuplicatePaths() {
  return [...duplicateCheckerUi.selectedPaths];
}

export function removeDuplicateCheckerPaths(paths: PathString[]) {
  if (paths.length === 0) return;
  const deleted = new Set(paths);
  const groups = duplicateCheckerUi.groups
    .map((group) => {
      const files = group.files.filter((file) => !deleted.has(file.path));
      const wastedBytes = group.size * Math.max(0, files.length - 1);
      return {
        ...group,
        files,
        wasted_bytes: wastedBytes,
      };
    })
    .filter((group) => group.files.length > 1);

  duplicateCheckerUi.groups = groups;
  duplicateCheckerUi.selectedPaths = new Set(
    [...duplicateCheckerUi.selectedPaths].filter((path) => !deleted.has(path)),
  );
  duplicateCheckerUi.totalReclaimableBytes = groups.reduce(
    (total, group) => total + Number(group.wasted_bytes || 0),
    0,
  );
}
