#!/usr/bin/env python3
"""
ax - Arch Linux system management tool

Commands:
    ax sync          - Sync system packages with packages.py
    ax edit          - open dotfiles in nvim, apply changes
    ax list          - List installed packages vs declared packages
    ax check         - Check for differences without making changes
"""

import argparse
import subprocess
import sys
import os
from datetime import datetime
from pathlib import Path

# Add the ax directory to path for imports
AX_DIR = Path(__file__).parent
sys.path.insert(0, str(AX_DIR))

from packages import SYSTEM_PACKAGES, AUR_PACKAGES, KEEP_PACKAGES

DOTFILES_DIR = Path.home() / ".dotfiles"
SNAPPER_CONFIG = "root"


def run(cmd: list[str], check: bool = True, capture: bool = False, cwd: str | None = None) -> subprocess.CompletedProcess:
    """Run a command and optionally capture output."""
    if capture:
        return subprocess.run(cmd, check=check, capture_output=True, text=True, cwd=cwd)
    return subprocess.run(cmd, check=check, cwd=cwd)


def run_sudo(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a command with sudo."""
    return run(["sudo"] + cmd, check=check)


def get_all_packages() -> set[str]:
    """Get set of all installed packages (including dependencies)."""
    result = run(["pacman", "-Qq"], capture=True, check=False)
    if result.returncode != 0:
        return set()
    return set(result.stdout.strip().split("\n")) if result.stdout.strip() else set()


def get_explicit_packages() -> set[str]:
    """Get set of explicitly installed packages (not dependencies)."""
    result = run(["pacman", "-Qeq"], capture=True, check=False)
    if result.returncode != 0:
        return set()
    return set(result.stdout.strip().split("\n")) if result.stdout.strip() else set()


def get_aur_packages() -> set[str]:
    """Get set of installed AUR/foreign packages."""
    result = run(["pacman", "-Qmq"], capture=True, check=False)
    if result.returncode != 0:
        return set()
    return set(result.stdout.strip().split("\n")) if result.stdout.strip() else set()


def install_packages(packages: list[str], aur: bool = False) -> bool:
    """Install packages using pacman or paru."""
    if not packages:
        return True
    
    cmd = ["paru", "-S", "--needed", "--noconfirm"] if aur else ["sudo", "pacman", "-S", "--needed", "--noconfirm"]
    cmd.extend(packages)
    
    try:
        run(cmd)
        return True
    except subprocess.CalledProcessError:
        return False


def remove_packages(packages: list[str]) -> bool:
    """Remove packages using pacman."""
    if not packages:
        return True

    packages = [p for p in packages if p not in KEEP_PACKAGES]
    if not packages:
        return True

    try:
        run_sudo(["pacman", "-Rns", "--noconfirm"] + packages)
        return True
    except subprocess.CalledProcessError:
        return False


def sync_packages(dry_run: bool = False) -> bool:
    """Sync installed packages with declared packages."""
    
    # Build target package sets
    target_system = set(SYSTEM_PACKAGES)
    target_aur = set(AUR_PACKAGES)

    # Get current state
    all_installed = get_all_packages()          # All packages (for install check)
    installed_aur = get_aur_packages()
    installed_official = all_installed - installed_aur
    
    # Calculate what to install (check against ALL installed packages)
    to_install_system = target_system - installed_official
    to_install_aur = target_aur - installed_aur
    
    all_targets = target_system | target_aur
    orphaned = set()
    removal_candidates = set()
    
    if dry_run:
        result = run(["pacman", "-Qtq"], capture=True, check=False)
        orphaned = set(result.stdout.strip().split("\n")) if result.stdout.strip() else set()
        removal_candidates = (orphaned - all_targets) - set(KEEP_PACKAGES)

        print("=== Dry Run ===")
        if to_install_system:
            print(f"\nWould install (pacman): {', '.join(sorted(to_install_system))}")
        if to_install_aur:
            print(f"\nWould install (AUR): {', '.join(sorted(to_install_aur))}")
        if removal_candidates:
            print(f"\nWould remove (first pass): {', '.join(sorted(removal_candidates))}")
        if not (to_install_system or to_install_aur or removal_candidates):
            print("\nSystem is in sync!")
        return True
    
    success = True
    did_work = False

    # Install system packages
    if to_install_system:
        print(f"\nInstalling system packages: {', '.join(sorted(to_install_system))}")
        if not install_packages(list(to_install_system), aur=False):
            success = False
        did_work = True
    
    # Install AUR packages
    if to_install_aur:
        print(f"\nInstalling AUR packages: {', '.join(sorted(to_install_aur))}")
        if not install_packages(list(to_install_aur), aur=True):
            success = False
        did_work = True

    # Remove unrequired packages not in targets
    while True:
        result = run(["pacman", "-Qtq"], capture=True, check=False)
        orphaned = set(result.stdout.strip().split("\n")) if result.stdout.strip() else set()
        removal_candidates = (orphaned - all_targets) - set(KEEP_PACKAGES)
        if not removal_candidates:
            break
        print(f"\nRemoving packages: {', '.join(sorted(removal_candidates))}")
        if not remove_packages(list(removal_candidates)):
            success = False
            break
        did_work = True
    
    
    if success and not did_work:
        print("System is already in sync!")
    
    return success


def cmd_sync(args):
    """Handle sync command."""
    return sync_packages(dry_run=args.dry_run)


def cmd_edit(args):
    """Handle edit command - the main workflow."""
    
    # Change to dotfiles directory
    os.chdir(DOTFILES_DIR)
    
    # Get git status before
    before_result = run(["git", "status", "--porcelain"], capture=True)
    before_status = before_result.stdout.strip()
    
    # Open editor
    print(f"\nOpening {DOTFILES_DIR} in neovim...")
    run(["nvim", "."])
    
    # Get git status after
    after_result = run(["git", "status", "--porcelain"], capture=True)
    after_status = after_result.stdout.strip()
    
    print("\nChanges detected:")
    run(["git", "diff", "--stat"])
    
    # Apply dotfiles with stow
    print("\nApplying dotfiles with stow...")
    run(["stow", "-R", "--no-folding", "-t", str(Path.home()), "home"], cwd=str(DOTFILES_DIR))
    
    # Sync packages
    print("\nSyncing packages...")
    sync_packages()
    
    # Commit changes
    print("\nCommitting changes...")
    run(["git", "add", "-A"])
    
    # Generate commit message
    commit_msg = f"{datetime.now().strftime('%Y-%m-%d %H:%M')}"
    run(["git", "commit", "-m", commit_msg])
    
    # Ask about push
    response = input("\nPush changes to remote? [y/N] ").strip().lower()
    if response == 'y':
        run(["git", "push"])
    
    print("\nDone!")
    return True


def cmd_list(args):
    """Handle list command."""
    all_installed = get_all_packages()
    installed_aur = get_aur_packages()
    installed_official = all_installed - installed_aur
    
    target_system = set(SYSTEM_PACKAGES)
    target_aur = set(AUR_PACKAGES)
    all_targets = target_system | target_aur
    
    print("=== Package Status ===\n")
    
    print("Declared (official):", len(target_system))
    print("Declared (AUR):", len(target_aur))
    print("Installed (all):", len(all_installed))
    print("Installed (AUR):", len(installed_aur))
    
    missing_system = target_system - installed_official
    missing_aur = target_aur - installed_aur
    explicit = get_explicit_packages()
    extra = (explicit - all_targets) - set(KEEP_PACKAGES)
    
    if missing_system:
        print(f"\nMissing (official): {', '.join(sorted(missing_system))}")
    if missing_aur:
        print(f"\nMissing (AUR): {', '.join(sorted(missing_aur))}")
    if extra:
        print(f"\nExtra (not declared): {', '.join(sorted(extra))}")
    
    if not (missing_system or missing_aur or extra):
        print("\nSystem is in sync!")
    
    return True


def cmd_check(args):
    """Handle check command (dry-run sync)."""
    args.dry_run = True
    return cmd_sync(args)


def main():
    parser = argparse.ArgumentParser(
        description="ax - Arch Linux system management tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    ax sync              # Sync packages with packages.py
    ax sync --dry-run    # Show what would be done
    ax edit              # Edit dotfiles workflow
    ax list              # List package status
    ax check             # Check sync status
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # sync command
    sync_parser = subparsers.add_parser("sync", help="Sync packages with packages.py")
    sync_parser.add_argument("-n", "--dry-run", action="store_true", help="Show what would be done")
    sync_parser.add_argument("-g", "--group", action="append", help="Include package group")
    sync_parser.set_defaults(func=cmd_sync)
    
    # edit command
    edit_parser = subparsers.add_parser("edit", help="Edit dotfiles workflow")
    edit_parser.set_defaults(func=cmd_edit)
    
    # list command
    list_parser = subparsers.add_parser("list", help="List package status")
    list_parser.set_defaults(func=cmd_list)
    
    # check command
    check_parser = subparsers.add_parser("check", help="Check sync status")
    check_parser.set_defaults(func=cmd_check)
    
    args = parser.parse_args()
    
    try:
        success = args.func(args)
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(130)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
