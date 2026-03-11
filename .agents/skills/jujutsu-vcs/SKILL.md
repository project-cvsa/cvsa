---
name: jujutsu-vcs
description: The guide of using Jujutsu instead of Git for version control. Always activate FIRST on any git/VCS operations (commit, status, branch, push, etc.). DO NOT IGNORE.
allowed-tools: Bash(jj *)
---

This skill helps you work with Jujutsu, a Git-compatible VCS featuring a simpler workflow, a more user-friendly CLI, and a lower risk of data loss.
This skill does not include instructions on workflow; it only introduces jj and teaches you how to use it. You should follow the instructions provided by the user, or the workflow preferences indicated elsewhere in the context.
By default, jj use Git as its storage backend. This means commits, trees, blobs, and file contents are stored in a regular Git repository for full compatibility with Git remotes, hosting platforms, and existing Git tools, while jj-specific metadata—like bookmarks, the operation log, and change IDs—is kept separately in the .jj/ directory.

## Identifing JJ Availability

The `.jj` dir excludes itself by `.gitignore` and does not share across the team.
This means you need to separately check whether JJ is available on the user’s computer.
Sometimes, the agent tool may not list `.jj` when you try to list files or dirs in the project because it’s in `.gitignore`.
Hence, running `jj` command is always the most reliable way to determine whether this is a jj repository.
If you got output like `Error: There is no jj repo in "."` or "command not found", this is not a jj repo.

## Key concepts

- **Change**: A logical unit of work with a stable identifier. It represents ongoing development of a feature, fix, or piece of functionality
- **Change ID**: A unique identifier for a change. You can refer them in a short form of few letters in k-z range (e.g. `uvzonqtw`)
- **Bookmark**: A bookmark is a named pointer to a commit. They are similar to Git’s branches and even more similar to Mercurial’s bookmarks. Unlike in Git, there is no concept of a "current bookmark"; bookmarks do not move when you create a new commit
- **Commit**: A snapshot of the files in the repository at a given point in time (technically a tree object), together with some metadata. The word "revision" is used as a synonym for "commit"
- **Working Copy**: Contains the files you’re currently working on. It is automatically snapshot at the beginning of almost every jj command, thus creating a new working-copy commit if any changes had been made in the working copy
- **Revsets**: An expression for selecting a set of commits
- **Filesets**: An expression for selecting a set of file
	
## Filesets and Revsets

In cheatsheet below, `[paths]` follows filesets syntax, and symbols like `@`, `x` and `y` can be replaced with any string that follows revsets syntax.
Note that when using filesets and revsets in command, you may need to enclose them in quotation marks to prevent them being accidentally escaped.

### Revsets Syntax

> Hint: Run `jj help -k revsets` to learn more

`@`: working copy, and `@-` for its parent
Tag name or bookmark name like `v3.1.4` or `feat/my-feature`
ID like `uvzonqtw` means a specific commit
`x-`: parents of x
`x+`: children of x
`x::y`: descendants of x that are also ancestors of y. Same as git’s `--ancestry-path x..y`

### Filesets Syntax

> Hint: Run `jj help -k filesets` to learn more

By default, the expression `path` is parsed as a glob pattern.

`file:path`: Matches cwd-relative exact file path.
`glob:pattern`: Matches file paths with cwd-relative Unix-style shell wildcard pattern.
`glob-i:pattern`: Case insensitive glob.
`root:path`, `root-glob:pattern`, `root-file:path`: Similar to above, but relative to the workspace (project root)

Examples:  
`glob:*.c`: all .c files in the current working directory non-recursively.
`glob:**/*.c`: similar to above one, but matches recursively.
`src ~ glob:**/*.rs`:

### Shared Syntax

These syntax are available both in revsets and filesets.

- `~` means not, so `~x` matches everything but `x` and `x ~ y` matches x but not y
- `&` means and, so `x & y` matches intersection of x and y
- `|` means or, so `x | y` matches union of x and y

## Key differences from Git

1. **Working Copy as a Commit**: No staging area. Files are automatically tracked and added to the current commit every time you run `jj` commands
2. **Effortless Jumping**: No stash or WIP commits needed. If you want to jump to another branch or commit, just `jj edit` it. There are no "uncommitted changes" blocking you
3. **Anonymous Branches**: Creating a named branch does not necessarily have to be your first step. You can naturally let the commit tree branch without having to name the branches
4. **Operation Log**: Every single action—every rebase, every description change, every file edit—is recorded in the operation log. You can run `jj undo` to instantly revert the last command, no matter how complex it was
5. **First-class Conflicts**: Conflicts are stored in the history. Conflicted states can be further rebased, merged, or backed out. You don’t have to resolve them before you work

## Cheatsheet

This cheatsheet is enough for common operations, organized by function.
JJ's help doc is comprehensive and easy to understand. Whenever you stuck at somewhere, you can always run `jj help` or pass the `--help` flag to any command to get help on how to use jj.

> **Note**: Always use `--git` or `-s` with diff/show commands to prevent GUI clients from hanging.

```bash
# Basic Operations
jj status # Show status of working copy, including files changed
jj log --limit n # Show recent n commits
jj log --revisions @ --no-graph --template "description" # See description of working copy

# Diff (always use --git or -s to prevent GUI hang)
jj diff --git # Show diff of working copy vs parent
jj diff --git -r x # Show diff between x and its parent
jj diff --git [paths] # Show diff for specific paths
jj diff --git --from x --to y # Show diff from x to y
jj diff -s # Show only whether modified, added, or deleted

# Show commit info (use --summary to prevent GUI hang)
jj show --summary x # Show summary of commit x

# Creating & Modifying Commits
jj new # Create new change on top of current one
jj new main # Create new change on top of main bookmark
jj edit x # Move working copy to x (edit commit x)
jj describe -m "msg" # Edit commit message of working copy
jj describe -m "msg" -r x # Edit commit message of revision x
jj commit # Finalize working copy as a new commit
jj squash # Fold current change into its parent
jj restore [paths] # Restore paths in working copy to parent commit
jj split [paths] -m "msg" # Split commit: paths stay in older, rest go to newer
jj abandon # Abandon working copy change
jj abandon -r x # Abandon specific revision

# Rebasing
jj rebase --source @ --onto x # Rebase current commit and descendants onto x
jj rebase --revisions x --insert-after y # Put x right after y

# Bookmarks (like Git branches)
jj bookmark create my-feature # Create new bookmark
jj bookmark delete my-feature # Delete bookmark
jj bookmark list # List all bookmarks
# Note: Bookmarks don't auto-move on new commits. Update before pushing:
jj bookmark move my-feature --to @ # Move bookmark to working copy

# File Operations
jj file list -r x # Show all files contained in commit x
jj file list -r x [paths] # Show paths contained in commit x
jj file untrack [paths] # Like `git rm --cached`
jj file annotate # Like `git blame`

# Git Interop
jj git init [--no-colocate] # Initialize jj repo (optionally non-colocated)
jj git clone <source> # Clone repository
jj git fetch # Fetch from remote (NO direct equivalent to git pull)
jj git push # Push to remote (auto force-push)
jj git push --bookmark develop # Push specific bookmark only

# Operation Log (powerful undo/redo)
jj undo # Undo last operation
jj redo # Redo most recently undone operation
jj op log --limit n # Show recent n operations
jj op restore id # Restore repo to state of operation id
jj op diff --from x --to y # See what changed from operation x to y
jj op diff --from x --patch --git # See git-style diff since operation x
```

### Reading logs

You can use `jj log` to see the history tree. You’d better use `jj log --limit n` to prevent context overflow.
A typical log looks like this:
```
@  mwqpzkuz user@example.com 2026-03-12 10:16:57 main e60cfa44
│  fix: a bug
│ ○  nynptron user@example.com 2026-03-14 15:45:45 develop 36b98762
├─╯  feat: a new feature under development
◆  rvmwuqwt user@example.com 2026-03-11 12:35:07 git_head() 425d78a6
│  feat: an amazing feature
```
In which:
- `mwqpzkuz` is the change ID (consistent), while `e60cfa44` is the commit ID (same as Git’s commit ID).
- ◆ means immutable commit (usually it’s already pushed to the remote)
- @ means the working copy
- ○ means regular commit, you can modify it if you want.
- Ignore `git_head()`, it’s deprecated.

### Splitting Commit

You can use `jj split [paths]` command to split one commit into two commits, each contains a portion of the changes. Changes in files specified via `[paths]` will kept in older commit, while the rest will be present in newer commit.
Let’s assume that you want to split the current commit (x) into two commits: x and y (x is the parent of y).
If current commit has two files changed: `foo` and `bar`, and if you want the x contains `foo` and y contains `bar`, you can run: `jj split "foo" -m "commit message for x"`. This results in:

Before
```
@  x user@example.com (Files changed: `foo`, `bar`)
|  (no description set)
```
After
```
@  y user@example.com (Files changed: `bar`)
|  (no description set)
○  x user@example.com (Files changed: `foo`)
|  commit message for x
```

## Additional Notes

**IMPORTANT**: Read this section to prevent users from been fired!

Although you can use `jj edit` to modify any commit, jj will prevent you from editing an immutable commit. Commits that have already been pushed to remote are usually immutable.
`jj git push` will automatically use force push, so the only way to prevent remote history from being overwritten is to avoid modifying immutable commits.
You can pass `--ignore-immutable` when jj hints you `Error: Commit x is immutable` to force-modify a commit, but you should only do this when the user explicitly tells you that you may do so. DO NOT pass `--ignore-immutable` without user’s approval. It’s as dangerous as Git force push.
