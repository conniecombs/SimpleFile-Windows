import type { TreeNode, ConflictAction, DirectoryListing, FileEntry, Nullable, PathString, TransferResult } from './types';
import * as api from './api';
import { basename, getParentPath } from './coreFileManager';

export interface IVirtualFileSystem {
  readonly id: string;
  readonly name: string;
  readonly isRemote: boolean;

  listDirectory(path: PathString): Promise<DirectoryListing>;
  createDirectory(path: PathString, name: string): Promise<string>;
  deleteEntry(path: PathString): Promise<void>;
  renameEntry(path: PathString, newName: string): Promise<string>;
  copyEntry(source: PathString, destination: PathString, conflictAction?: ConflictAction): Promise<string>;
  moveEntry(source: PathString, destination: PathString, conflictAction?: ConflictAction): Promise<string>;
  getEntryInfo(path: PathString): Promise<FileEntry>;
  createFile(path: PathString, name: string): Promise<string>;
  listSubdirectories(path: PathString): Promise<TreeNode[]>;
  readFilePreview(path: PathString, maxLength: number): Promise<any>;
  openFile(path: PathString): Promise<void>;
  openFileWith(path: PathString, application: string): Promise<void>;
  compareFiles(path1: PathString, path2: PathString): Promise<any>;
  moveToTrash(paths: PathString[]): Promise<void>;
}

export class LocalFileSystem implements IVirtualFileSystem {
  readonly id = 'local';
  readonly name = 'Local File System';
  readonly isRemote = false;

  async listDirectory(path: PathString): Promise<DirectoryListing> {
    return api.listDirectory(path);
  }

  async createDirectory(path: PathString, name: string): Promise<string> {
    return api.createDirectory(path, name);
  }

  async deleteEntry(path: PathString): Promise<void> {
    return api.deleteEntry(path);
  }

  async renameEntry(path: PathString, newName: string): Promise<string> {
    return api.renameEntry(path, newName);
  }

  async copyEntry(source: PathString, destination: PathString, conflictAction: ConflictAction = 'error'): Promise<string> {
    return api.copyEntryResolved(source, destination, conflictAction);
  }

  async moveEntry(source: PathString, destination: PathString, conflictAction: ConflictAction = 'error'): Promise<string> {
    return api.moveEntryResolved(source, destination, conflictAction);
  }

  async getEntryInfo(path: PathString): Promise<FileEntry> {
    return api.getEntryInfo(path);
  }

  async createFile(path: PathString, name: string): Promise<string> {
    return api.createFile(path, name);
  }

  async listSubdirectories(path: PathString): Promise<TreeNode[]> {
    return api.listSubdirectories(path);
  }

  async readFilePreview(path: PathString, maxLength: number): Promise<any> {
    return api.readFilePreview(path, maxLength);
  }

  async openFile(path: PathString): Promise<void> {
    return api.openFile(path);
  }

  async openFileWith(path: PathString, application: string): Promise<void> {
    return api.openFileWith(path, application);
  }

  async compareFiles(path1: PathString, path2: PathString): Promise<any> {
    return api.compareFiles(path1, path2);
  }

  async moveToTrash(paths: PathString[]): Promise<void> {
    return api.moveToTrash(paths);
  }
}

// Global active file system state
let activeFileSystem: IVirtualFileSystem = new LocalFileSystem();

export function getActiveFileSystem(): IVirtualFileSystem {
  return activeFileSystem;
}

export function setActiveFileSystem(vfs: IVirtualFileSystem) {
  activeFileSystem = vfs;
}
