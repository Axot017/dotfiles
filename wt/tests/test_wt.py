from __future__ import annotations

import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wt import ExternalTools, Runner, WTError, WorktreeManager


def run(*command: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(command), cwd=cwd, check=True, capture_output=True, text=True
    )


class FakeTools:
    def __init__(self) -> None:
        self.added: list[Path] = []
        self.removed: list[Path] = []
        self.killed: list[Path] = []
        self.connected: list[Path] = []
        self.selections: list[str] = []

    def pick(self, choices: list[str], prompt: str) -> str:
        if self.selections:
            wanted = self.selections.pop(0)
            for choice in choices:
                if wanted in choice:
                    return choice
            raise AssertionError(f"{wanted!r} not in {choices!r}")
        return choices[0]

    def zoxide_add(self, path: Path) -> None:
        self.added.append(path)

    def zoxide_remove(self, path: Path) -> None:
        self.removed.append(path)

    def sesh_connect(self, path: Path) -> None:
        self.connected.append(path)

    def kill_tmux_at(self, path: Path) -> None:
        self.killed.append(path)


class WorktreeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.remote = self.base / "remote.git"
        self.seed = self.base / "seed"
        self.projects = self.base / "projects"
        self.project = self.projects / "demo"
        self.root = (self.base / "managed").resolve()
        self.projects.mkdir()

        run("git", "init", "--bare", str(self.remote))
        run("git", "init", "-b", "main", str(self.seed))
        run("git", "config", "user.name", "WT Test", cwd=self.seed)
        run("git", "config", "user.email", "wt@example.invalid", cwd=self.seed)
        (self.seed / "README").write_text("main\n")
        (self.seed / ".gitignore").write_text("ignored.tmp\n")
        run("git", "add", "README", ".gitignore", cwd=self.seed)
        run("git", "commit", "-m", "initial", cwd=self.seed)
        run("git", "remote", "add", "origin", str(self.remote), cwd=self.seed)
        run("git", "push", "-u", "origin", "main", cwd=self.seed)
        run("git", "symbolic-ref", "HEAD", "refs/heads/main", cwd=self.remote)
        run("git", "clone", str(self.remote), str(self.project))
        run("git", "config", "user.name", "WT Test", cwd=self.project)
        run("git", "config", "user.email", "wt@example.invalid", cwd=self.project)

        self.tools = FakeTools()
        self.output = io.StringIO()
        self.manager = WorktreeManager(
            root=self.root,
            cwd=self.projects,
            tools=self.tools,  # type: ignore[arg-type]
            stdout=self.output,
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def new(self, branch: str = "user/feature/one") -> Path:
        return self.manager.new(str(self.project), branch, "main")

    def test_new_creates_derived_worktree_and_runs_integrations(self) -> None:
        destination = self.new()

        self.assertEqual(destination, self.root / "demo-feature-one")
        self.assertTrue((destination / "README").is_file())
        self.assertEqual(
            run("git", "branch", "--show-current", cwd=destination).stdout.strip(),
            "user/feature/one",
        )
        self.assertEqual(self.tools.added, [destination])
        self.assertEqual(self.tools.connected, [destination])
        upstream = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
            cwd=destination,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(upstream.returncode, 0)

    def test_new_uses_alternate_origin_base(self) -> None:
        run("git", "checkout", "-b", "develop", cwd=self.seed)
        (self.seed / "BASE").write_text("develop\n")
        run("git", "add", "BASE", cwd=self.seed)
        run("git", "commit", "-m", "develop", cwd=self.seed)
        run("git", "push", "origin", "develop", cwd=self.seed)

        destination = self.manager.new(str(self.project), "user/from-develop", "develop")
        self.assertTrue((destination / "BASE").is_file())

    def test_new_rejects_existing_local_remote_and_destination(self) -> None:
        run("git", "branch", "user/local", cwd=self.project)
        with self.assertRaisesRegex(WTError, "local branch already exists"):
            self.manager.new(str(self.project), "user/local", "main")

        run("git", "checkout", "-b", "user/remote", cwd=self.seed)
        run("git", "push", "origin", "user/remote", cwd=self.seed)
        with self.assertRaisesRegex(WTError, "already exists on origin"):
            self.manager.new(str(self.project), "user/remote", "main")

        collision = self.root / "demo-collision"
        collision.mkdir(parents=True)
        with self.assertRaisesRegex(WTError, "destination already exists"):
            self.manager.new(str(self.project), "user/collision", "main")

    def test_new_interactive_discovers_direct_child_and_prompts_branch(self) -> None:
        manager = WorktreeManager(
            root=self.root,
            cwd=self.projects,
            tools=self.tools,  # type: ignore[arg-type]
            input_fn=lambda prompt: "user/prompted",
        )
        destination = manager.new(None, None, "main")
        self.assertEqual(destination, self.root / "demo-prompted")

    def test_delete_requires_exact_branch_refuses_dirty_and_preserves_branch(self) -> None:
        destination = self.new("user/topic")
        (destination / "dirty.txt").write_text("dirty")

        with self.assertRaisesRegex(WTError, "exact branch"):
            self.manager.delete(str(self.project), "topic", force=False)
        with self.assertRaisesRegex(WTError, "worktree is dirty"):
            self.manager.delete(str(self.project), "user/topic", force=False)
        self.assertTrue(destination.exists())

        removed = self.manager.delete(str(self.project), "user/topic", force=True)
        self.assertEqual(removed.path, destination)
        self.assertFalse(destination.exists())
        branches = run("git", "branch", "--list", "user/topic", cwd=self.project).stdout
        self.assertIn("user/topic", branches)
        self.assertEqual(self.tools.killed, [destination])
        self.assertEqual(self.tools.removed, [destination])

    def test_delete_refuses_ignored_files_without_force(self) -> None:
        destination = self.new("user/ignored")
        (destination / "ignored.tmp").write_text("important local artifact")

        with self.assertRaisesRegex(WTError, "worktree is dirty"):
            self.manager.delete(str(self.project), "user/ignored", force=False)
        self.assertTrue(destination.exists())

        self.manager.delete(str(self.project), "user/ignored", force=True)
        self.assertFalse(destination.exists())

    def test_delete_project_only_uses_worktree_picker(self) -> None:
        first = self.new("user/first")
        second = self.new("user/second")
        self.tools.selections = ["user/second"]

        removed = self.manager.delete(str(self.project), None, force=False)
        self.assertEqual(removed.path, second)
        self.assertTrue(first.exists())
        self.assertFalse(second.exists())

    def test_clean_preflights_every_worktree_before_removing_anything(self) -> None:
        first = self.new("user/first")
        second = self.new("user/second")
        (second / "untracked").write_text("dirty")

        with self.assertRaisesRegex(WTError, "nothing removed"):
            self.manager.clean(str(self.project), force=False, yes=True)
        self.assertTrue(first.exists())
        self.assertTrue(second.exists())

        removed = self.manager.clean(str(self.project), force=True, yes=True)
        self.assertEqual(len(removed), 2)
        self.assertFalse(first.exists())
        self.assertFalse(second.exists())
        branches = run("git", "branch", "--list", "user/*", cwd=self.project).stdout
        self.assertIn("user/first", branches)
        self.assertIn("user/second", branches)

    def test_clean_preflights_locked_worktrees(self) -> None:
        first = self.new("user/first")
        second = self.new("user/locked")
        run("git", "worktree", "lock", "--reason", "test lock", str(second), cwd=self.project)

        with self.assertRaisesRegex(WTError, "locked worktrees found; nothing removed"):
            self.manager.clean(str(self.project), force=False, yes=True)
        self.assertTrue(first.exists())
        self.assertTrue(second.exists())

        removed = self.manager.clean(str(self.project), force=True, yes=True)
        self.assertEqual(len(removed), 2)
        self.assertFalse(first.exists())
        self.assertFalse(second.exists())

    def test_clean_confirmation_can_cancel_without_changes(self) -> None:
        destination = self.new("user/keep")
        manager = WorktreeManager(
            root=self.root,
            cwd=self.projects,
            tools=self.tools,  # type: ignore[arg-type]
            input_fn=lambda prompt: "no",
        )
        with self.assertRaisesRegex(WTError, "cancelled"):
            manager.clean(str(self.project), force=False, yes=False)
        self.assertTrue(destination.exists())

    def test_list_derives_owner_from_git_metadata_and_reports_status(self) -> None:
        clean = self.new("user/clean")
        dirty = self.new("user/dirty")
        (dirty / "new-file").write_text("dirty")

        rows = self.manager.list(None)
        self.assertEqual({row[0] for row in rows}, {self.project.resolve()})
        statuses = {row[1].branch: row[2] for row in rows}
        self.assertEqual(statuses, {"user/clean": "clean", "user/dirty": "dirty"})
        table = self.output.getvalue()
        self.assertIn("PROJECT", table)
        self.assertIn(str(clean), table)
        self.assertIn(str(dirty), table)

    def test_linked_worktree_argument_normalizes_to_primary_project(self) -> None:
        linked = self.new("user/linked")
        destination = self.manager.new(str(linked), "user/from-linked", "main")

        self.assertEqual(destination, self.root / "demo-from-linked")
        owners = self.manager.managed_for(self.project)
        self.assertEqual({item.branch for item in owners}, {"user/linked", "user/from-linked"})

    def test_interactive_tools_preserve_terminal_output(self) -> None:
        runner = Mock(spec=Runner)
        runner.run.return_value = subprocess.CompletedProcess(
            args=["fzf"], returncode=0, stdout="second\n", stderr=None
        )
        tools = ExternalTools(runner, which=lambda command: f"/bin/{command}")

        self.assertEqual(tools.pick(["first", "second"], "Project"), "second")
        self.assertTrue(runner.run.call_args.kwargs["stderr_to_terminal"])
        tools.sesh_connect(Path("/tmp/example"))
        self.assertFalse(runner.run.call_args.kwargs["capture"])

    def test_rejects_non_repository_and_bare_project(self) -> None:
        ordinary = self.base / "ordinary"
        ordinary.mkdir()
        with self.assertRaisesRegex(WTError, "not a Git project"):
            self.manager.new(str(ordinary), "user/test", "main")
        with self.assertRaises(WTError):
            self.manager.new(str(self.remote), "user/test", "main")


if __name__ == "__main__":
    unittest.main()
