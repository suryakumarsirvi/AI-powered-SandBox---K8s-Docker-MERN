import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    children?: FileNode[];
}

// Ensure the path does not traverse outside the root directory
export function resolveSafePath(baseDir: string, targetPath: string): string {
    const absoluteBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(path.join(absoluteBase, targetPath));
    
    if (!resolvedPath.startsWith(absoluteBase)) {
        throw new Error('Directory traversal attempt detected');
    }
    return resolvedPath;
}

export async function getDirTree(dir: string): Promise<FileNode> {
    const stats = await fs.stat(dir);
    const info: FileNode = {
        name: path.basename(dir),
        path: dir,
        type: stats.isDirectory() ? 'directory' : 'file'
    };

    if (stats.isDirectory()) {
        const children = await fs.readdir(dir);
        // Exclude node_modules, .git, and agent builds to keep payloads small
        const filteredChildren = children.filter(child => 
            child !== 'node_modules' && 
            child !== '.git' && 
            child !== 'agent' &&
            child !== 'dist'
        );
        info.children = await Promise.all(
            filteredChildren.map(child => getDirTree(path.join(dir, child)))
        );
    } else {
        info.size = stats.size;
    }
    return info;
}

export async function writeFileContent(baseDir: string, relativePath: string, content: string): Promise<void> {
    const safePath = resolveSafePath(baseDir, relativePath);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
}

export async function readFileContent(baseDir: string, relativePath: string): Promise<string> {
    const safePath = resolveSafePath(baseDir, relativePath);
    return await fs.readFile(safePath, 'utf-8');
}

export async function deletePath(baseDir: string, relativePath: string): Promise<void> {
    const safePath = resolveSafePath(baseDir, relativePath);
    await fs.rm(safePath, { recursive: true, force: true });
}
