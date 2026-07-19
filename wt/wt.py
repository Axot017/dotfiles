#!/usr/bin/env python3
"""Small command-line manager for Git worktrees."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, TextIO


class WTError(RuntimeError):
    """An expected, user-facing error."""


def terminal_input(prompt: str) -> str:
    """Read interactive input from the terminal, never from piped stdin."""
    if sys.stdin.isatty():
        try:
            return input(prompt)
        except EOFError as exc:
            raise WTError("interactive input cancelled") from exc
    try:
        with open("/dev/tty", "r+", encoding="utf-8") as terminal:
            terminal.write(prompt)
            terminal.flush()
            value = terminal.readline()
    except OSError as exc:
        raise WTError("interactive input requires a terminal") from exc
    if not value:
        raise WTError("interactive input cancelled")
    return value.rstrip("\n")


class Runner:
    """Subprocess boundary, kept separate so command behavior is testable."""

    def run(
        self,
        command: list[str],
        *,
        cwd: Path | None = None,
        check: bool = True,
        input_text: str | None = None,
        capture: bool = True,
        stderr_to_terminal: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                command,
                cwd=cwd,
                check=check,
                stdout=subprocess.PIPE if capture else None,
                stderr=None if stderr_to_terminal or not capture else subprocess.PIPE,
                text=True,
                input=input_text,
            )
        except FileNotFoundError as exc:
            raise WTError(f"required command not found: {command[0]}") from exc
        except subprocess.CalledProcessError as exc:
            detail = (exc.stderr or exc.stdout or "").strip()
            message = f"command failed: {' '.join(command)}"
            raise WTError(f"{message}: {detail}" if detail else message) from exc


@dataclass(frozen=True)
class Worktree:
    path: Path
    branch: str | None
    head: str | None = None
    bare: bool = False
    detached: bool = False
    locked: bool = False
    lock_reason: str | None = None


class ExternalTools:
    """Optional desktop/session integrations."""

    def __init__(self, runner: Runner, which: Callable[[str], str | None] = shutil.which):
        self.runner = runner
        self.which = which

    def pick(self, choices: list[str], prompt: str) -> str:
        if not choices:
            raise WTError(f"no {prompt.lower()} available")
        if not self.which("fzf"):
            raise WTError("fzf is required for interactive selection")
        result = self.runner.run(
            ["fzf", "--prompt", f"{prompt}> "],
            input_text="\n".join(choices) + "\n",
            check=False,
            stderr_to_terminal=True,
        )
        selected = (result.stdout or "").rstrip("\n")
        if result.returncode != 0 or not selected:
            raise WTError("selection cancelled")
        return selected

    def zoxide_add(self, path: Path) -> None:
        if self.which("zoxide"):
            self.runner.run(["zoxide", "add", str(path)], check=False)

    def zoxide_remove(self, path: Path) -> None:
        if self.which("zoxide"):
            self.runner.run(["zoxide", "remove", str(path)], check=False)

    def sesh_connect(self, path: Path) -> None:
        if not self.which("sesh"):
            raise WTError("sesh is required to connect to the new worktree")
        self.runner.run(["sesh", "connect", str(path)], capture=False)

    def kill_tmux_at(self, path: Path) -> None:
        if not self.which("tmux"):
            return
        result = self.runner.run(
            ["tmux", "list-sessions", "-F", "#{session_name}\t#{session_path}"],
            check=False,
        )
        target_path = path.resolve(strict=False)
        for line in (result.stdout or "").splitlines():
            name, separator, session_path = line.partition("\t")
            if not separator or not session_path:
                continue
            if Path(session_path).expanduser().resolve(strict=False) == target_path:
                self.runner.run(["tmux", "kill-session", "-t", name], check=False)


class WorktreeManager:
    def __init__(
        self,
        *,
        root: Path | None = None,
        cwd: Path | None = None,
        runner: Runner | None = None,
        tools: ExternalTools | None = None,
        input_fn: Callable[[str], str] = input,
        stdout: TextIO = sys.stdout,
    ) -> None:
        self.root = (root or Path.home() / ".worktrees").expanduser().resolve(strict=False)
        self.cwd = (cwd or Path.cwd()).resolve()
        self.runner = runner or Runner()
        self.tools = tools or ExternalTools(self.runner)
        self.input = input_fn
        self.stdout = stdout

    def git(
        self, project: Path, *arguments: str, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        return self.runner.run(["git", "-C", str(project), *arguments], check=check)

    def validate_project(self, path: Path) -> Path:
        candidate = path.expanduser()
        if not candidate.is_absolute():
            candidate = self.cwd / candidate
        candidate = candidate.resolve(strict=False)
        if not candidate.exists() or not candidate.is_dir():
            raise WTError(f"project does not exist: {candidate}")

        bare = self.git(candidate, "rev-parse", "--is-bare-repository", check=False)
        if bare.returncode != 0:
            raise WTError(f"not a Git project: {candidate}")
        if bare.stdout.strip() == "true":
            raise WTError(f"bare repositories are not supported: {candidate}")
        top = self.git(candidate, "rev-parse", "--show-toplevel", check=False)
        if top.returncode != 0 or not (top.stdout or "").strip():
            raise WTError(f"not a Git project: {candidate}")
        top_path = Path((top.stdout or "").strip()).resolve()

        listing = self.git(top_path, "worktree", "list", "--porcelain", check=False)
        if listing.returncode != 0:
            raise WTError(f"cannot inspect Git worktrees for: {candidate}")
        worktrees = self.parse_worktrees(listing.stdout or "")
        return worktrees[0].path if worktrees else top_path

    def owner_for_worktree(self, path: Path) -> Path:
        result = self.git(path, "worktree", "list", "--porcelain", check=False)
        if result.returncode != 0:
            raise WTError(f"not a linked Git worktree: {path}")
        worktrees = self.parse_worktrees(result.stdout)
        if not worktrees:
            raise WTError(f"cannot determine project owner for: {path}")
        # Git lists the primary worktree first; this is authoritative even when
        # the common Git directory lives somewhere other than PROJECT/.git.
        return self.validate_project(worktrees[0].path)

    @staticmethod
    def parse_worktrees(output: str) -> list[Worktree]:
        records: list[Worktree] = []
        fields: dict[str, str | bool] = {}

        def append_record() -> None:
            if "worktree" not in fields:
                return
            branch_ref = fields.get("branch")
            branch = None
            if isinstance(branch_ref, str):
                prefix = "refs/heads/"
                branch = branch_ref[len(prefix) :] if branch_ref.startswith(prefix) else branch_ref
            records.append(
                Worktree(
                    path=Path(str(fields["worktree"])).resolve(strict=False),
                    branch=branch,
                    head=str(fields["HEAD"]) if "HEAD" in fields else None,
                    bare=bool(fields.get("bare", False)),
                    detached=bool(fields.get("detached", False)),
                    locked="locked" in fields,
                    lock_reason=(
                        str(fields["locked"])
                        if isinstance(fields.get("locked"), str)
                        else None
                    ),
                )
            )

        for line in output.splitlines() + [""]:
            if not line:
                append_record()
                fields = {}
                continue
            key, _, value = line.partition(" ")
            fields[key] = value if value else True
        return records

    def worktrees_for(self, project: Path) -> list[Worktree]:
        result = self.git(project, "worktree", "list", "--porcelain")
        return self.parse_worktrees(result.stdout)

    def is_managed_path(self, path: Path) -> bool:
        resolved = path.resolve(strict=False)
        return resolved != self.root and resolved.is_relative_to(self.root)

    def managed_for(self, project: Path) -> list[Worktree]:
        primary = project.resolve(strict=False)
        return [
            worktree
            for worktree in self.worktrees_for(project)
            if self.is_managed_path(worktree.path)
            and worktree.path != primary
            and not worktree.bare
        ]

    def managed_projects(self) -> list[Path]:
        if not self.root.is_dir():
            return []
        projects: dict[Path, None] = {}
        for candidate in self.root.iterdir():
            if not candidate.is_dir():
                continue
            try:
                owner = self.owner_for_worktree(candidate)
                if not self.managed_for(owner):
                    continue
            except WTError:
                continue
            projects[owner] = None
        return sorted(projects, key=lambda path: (path.name.lower(), str(path)))

    def discover_projects(self) -> list[Path]:
        candidates = [self.cwd]
        try:
            candidates.extend(path for path in self.cwd.iterdir() if path.is_dir())
        except OSError as exc:
            raise WTError(f"cannot inspect {self.cwd}: {exc}") from exc
        projects: dict[Path, None] = {}
        for candidate in candidates:
            try:
                project = self.validate_project(candidate)
            except WTError:
                continue
            projects[project] = None
        return sorted(projects, key=lambda path: (path.name.lower(), str(path)))

    def resolve_project(self, value: str, *, managed_only: bool = False) -> Path:
        raw = Path(value).expanduser()
        possible_path = raw if raw.is_absolute() else self.cwd / raw
        if possible_path.exists():
            project = self.validate_project(possible_path)
            if managed_only and not self.managed_for(project):
                raise WTError(f"project has no managed worktrees: {project}")
            return project

        if managed_only:
            pool = self.managed_projects()
        else:
            pool = list(dict.fromkeys(self.discover_projects() + self.managed_projects()))
        matches = [project for project in pool if project.name == value]
        if not matches:
            raise WTError(f"project not found: {value}")
        if len(matches) > 1:
            raise WTError(f"project name is ambiguous; use a path: {value}")
        return matches[0]

    def pick_project(self, projects: list[Path]) -> Path:
        choices = [str(project) for project in projects]
        return Path(self.tools.pick(choices, "Project")).resolve()

    def pick_worktree(self, worktrees: list[Worktree]) -> Worktree:
        by_choice = {
            f"{worktree.branch or '(detached)'}\t{worktree.path}": worktree
            for worktree in worktrees
        }
        selected = self.tools.pick(list(by_choice), "Worktree")
        return by_choice[selected]

    @staticmethod
    def destination_name(project: Path, branch: str) -> str:
        components = branch.split("/")
        suffix = "-".join(components[1:] if len(components) > 1 else components)
        return f"{project.name}-{suffix}"

    def new(self, project_value: str | None, branch: str | None, base: str) -> Path:
        if project_value is None:
            projects = self.discover_projects()
            if not projects:
                raise WTError("no Git projects found in the current directory or its children")
            project = self.pick_project(projects)
        else:
            project = self.resolve_project(project_value)

        if branch is None:
            branch = self.input("Branch: ").strip()
        if not branch:
            raise WTError("branch is required")
        valid = self.git(project, "check-ref-format", "--branch", branch, check=False)
        if valid.returncode != 0:
            raise WTError(f"invalid branch name: {branch}")

        base_branch = base.removeprefix("refs/remotes/origin/").removeprefix("origin/")
        if not base_branch:
            raise WTError("base branch is required")
        self.git(project, "fetch", "origin", base_branch)

        local = self.git(
            project, "show-ref", "--verify", "--quiet", f"refs/heads/{branch}", check=False
        )
        if local.returncode == 0:
            raise WTError(f"local branch already exists: {branch}")
        remote = self.git(
            project,
            "ls-remote",
            "--exit-code",
            "--heads",
            "origin",
            f"refs/heads/{branch}",
            check=False,
        )
        if remote.returncode == 0:
            raise WTError(f"branch already exists on origin: {branch}")
        if remote.returncode not in (0, 2):
            raise WTError("could not check target branch on origin")

        base_ref = f"origin/{base_branch}"
        exists = self.git(project, "rev-parse", "--verify", "--quiet", base_ref, check=False)
        if exists.returncode != 0:
            raise WTError(f"base branch not found on origin: {base_branch}")

        destination = self.root / self.destination_name(project, branch)
        if destination.exists() or destination.is_symlink() or any(
            item.path == destination.resolve(strict=False) for item in self.worktrees_for(project)
        ):
            raise WTError(f"worktree destination already exists: {destination}")

        self.root.mkdir(parents=True, exist_ok=True)
        self.git(
            project,
            "worktree",
            "add",
            "-b",
            branch,
            "--no-track",
            str(destination),
            base_ref,
        )
        self.tools.zoxide_add(destination)
        try:
            self.tools.sesh_connect(destination)
        except WTError as exc:
            raise WTError(f"worktree created at {destination}, but {exc}") from exc
        return destination

    def is_dirty(self, worktree: Worktree) -> bool:
        if not worktree.path.is_dir():
            return False
        result = self.git(
            worktree.path,
            "status",
            "--porcelain",
            "--ignored",
            check=False,
        )
        return result.returncode != 0 or bool((result.stdout or "").strip())

    def remove_one(self, project: Path, worktree: Worktree, *, force: bool) -> None:
        if not self.is_managed_path(worktree.path):
            raise WTError(f"refusing to remove unmanaged worktree: {worktree.path}")
        if worktree.locked and not force:
            reason = f": {worktree.lock_reason}" if worktree.lock_reason else ""
            raise WTError(f"worktree is locked{reason} (use --force): {worktree.path}")
        if self.is_dirty(worktree) and not force:
            raise WTError(f"worktree is dirty (use --force): {worktree.path}")

        self.tools.kill_tmux_at(worktree.path)
        self.tools.zoxide_remove(worktree.path)
        arguments = ["worktree", "remove"]
        if force:
            arguments.append("--force")
            if worktree.locked:
                arguments.append("--force")
        arguments.append(str(worktree.path))
        self.git(project, *arguments)
        self.git(project, "worktree", "prune")

    def delete(
        self, project_value: str | None, branch: str | None, *, force: bool
    ) -> Worktree:
        if project_value is None:
            projects = self.managed_projects()
            if not projects:
                raise WTError("no managed worktrees found")
            project = self.pick_project(projects)
        else:
            project = self.resolve_project(project_value, managed_only=True)

        worktrees = self.managed_for(project)
        if not worktrees:
            raise WTError(f"project has no managed worktrees: {project}")
        if branch is None:
            target = self.pick_worktree(worktrees)
        else:
            matches = [worktree for worktree in worktrees if worktree.branch == branch]
            if not matches:
                raise WTError(f"managed worktree not found for exact branch: {branch}")
            if len(matches) > 1:
                raise WTError(f"multiple worktrees found for branch: {branch}")
            target = matches[0]

        self.remove_one(project, target, force=force)
        return target

    def clean(self, project_value: str, *, force: bool, yes: bool) -> list[Worktree]:
        project = self.resolve_project(project_value)
        worktrees = self.managed_for(project)
        if not worktrees:
            print(f"No managed worktrees for {project.name}.", file=self.stdout)
            return []

        locked = [worktree for worktree in worktrees if worktree.locked]
        if locked and not force:
            paths = ", ".join(str(worktree.path) for worktree in locked)
            raise WTError(f"locked worktrees found; nothing removed (use --force): {paths}")

        dirty = [worktree for worktree in worktrees if self.is_dirty(worktree)]
        if dirty and not force:
            paths = ", ".join(str(worktree.path) for worktree in dirty)
            raise WTError(f"dirty worktrees found; nothing removed (use --force): {paths}")

        if not yes:
            answer = self.input(
                f"Remove {len(worktrees)} managed worktree(s) for {project.name}? [y/N] "
            ).strip().lower()
            if answer not in {"y", "yes"}:
                raise WTError("clean cancelled")

        # Dirty state was preflighted above; no deletion starts before all are safe.
        for worktree in worktrees:
            self.remove_one(project, worktree, force=force)
        return worktrees

    def list(self, project_value: str | None) -> list[tuple[Path, Worktree, str]]:
        if project_value is None:
            projects = self.managed_projects()
        else:
            projects = [self.resolve_project(project_value)]

        rows: list[tuple[Path, Worktree, str]] = []
        for project in projects:
            for worktree in self.managed_for(project):
                if not worktree.path.exists():
                    status = "missing"
                else:
                    status = "dirty" if self.is_dirty(worktree) else "clean"
                rows.append((project, worktree, status))
        rows.sort(key=lambda row: (row[0].name.lower(), row[1].branch or "", str(row[1].path)))
        self.print_table(rows)
        return rows

    def print_table(self, rows: list[tuple[Path, Worktree, str]]) -> None:
        headers = ("PROJECT", "BRANCH", "STATUS", "PATH")
        values = [
            (project.name, worktree.branch or "(detached)", status, str(worktree.path))
            for project, worktree, status in rows
        ]
        widths = [
            max(len(headers[index]), *(len(row[index]) for row in values))
            if values
            else len(headers[index])
            for index in range(3)
        ]
        print(
            f"{headers[0]:<{widths[0]}}  {headers[1]:<{widths[1]}}  "
            f"{headers[2]:<{widths[2]}}  {headers[3]}",
            file=self.stdout,
        )
        for row in values:
            print(
                f"{row[0]:<{widths[0]}}  {row[1]:<{widths[1]}}  "
                f"{row[2]:<{widths[2]}}  {row[3]}",
                file=self.stdout,
            )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage Git worktrees under ~/.worktrees")
    commands = parser.add_subparsers(dest="command", required=True)

    new = commands.add_parser("new", help="create and connect to a worktree")
    new.add_argument("project", nargs="?")
    new.add_argument("branch", nargs="?")
    new.add_argument("--base", default="main", help="origin branch to start from (default: main)")

    delete = commands.add_parser("delete", help="remove one managed worktree")
    delete.add_argument("project", nargs="?")
    delete.add_argument("branch", nargs="?")
    delete.add_argument("--force", action="store_true", help="allow removal of a dirty worktree")

    clean = commands.add_parser("clean", help="remove every managed worktree for a project")
    clean.add_argument("project")
    clean.add_argument("--force", action="store_true", help="allow removal of dirty worktrees")
    clean.add_argument("--yes", action="store_true", help="skip confirmation")

    listing = commands.add_parser("list", help="list managed worktrees")
    listing.add_argument("project", nargs="?")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    manager = WorktreeManager(input_fn=terminal_input)
    try:
        if args.command == "new":
            manager.new(args.project, args.branch, args.base)
        elif args.command == "delete":
            manager.delete(args.project, args.branch, force=args.force)
        elif args.command == "clean":
            manager.clean(args.project, force=args.force, yes=args.yes)
        elif args.command == "list":
            manager.list(args.project)
        return 0
    except (WTError, OSError, EOFError) as exc:
        print(f"wt: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nwt: cancelled", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
