#!/usr/bin/env python3
"""
ax - Arch Linux system management tool

A declarative package manager wrapper with btrfs snapshot integration.

Commands:
    ax sync          - Sync system packages with packages.py
    ax edit          - Create snapshot, open dotfiles in nvim, apply changes
    ax snapshot      - Create a manual snapshot
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

from packages import SYSTEM_PACKAGES, AUR_PACKAGES, KEEP_PACKAGES, GROUPS

DOTFILES_DIR = Path.home() / "Projects" / "dotfiles"
SNAPPER_CONFIG = "root"


def run(cmd: list[str], check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a command and optionally capture output."""
    if capture:
        return subprocess.run(cmd, check=check, capture_output=True, text=True)
    return subprocess.run(cmd, check=check)


def run_sudo(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a command with sudo."""
    return run(["sudo"] + cmd, check=check)


def get_installed_packages() -> set[str]:
    """Get set of explicitly installed packages."""
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


def create_snapshot(description: str) -> str | None:
    """Create a snapper snapshot and return the snapshot number."""
    try:
        result = run_sudo(
            ["snapper", "-c", SNAPPER_CONFIG, "create", "-d", description, "-p"],
            check=True
        )
        # snapper -p prints the snapshot number
        return result.stdout.strip() if hasattr(result, 'stdout') and result.stdout else None
    except subprocess.CalledProcessError as e:
        print(f"Warning: Failed to create snapshot: {e}")
        return None


def delete_snapshot(snapshot_num: str) -> bool:
    """Delete a snapshot by number."""
    try:
        run_sudo(["snapper", "-c", SNAPPER_CONFIG, "delete", snapshot_num])
        return True
    except subprocess.CalledProcessError:
        return False


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
    
    # Filter out packages we want to keep
    packages = [p for p in packages if p not in KEEP_PACKAGES]
    if not packages:
        return True
    
    try:
        run_sudo(["pacman", "-Rns", "--noconfirm"] + packages)
        return True
    except subprocess.CalledProcessError:
        return False


def sync_packages(dry_run: bool = False, groups: list[str] | None = None) -> bool:
    """Sync installed packages with declared packages."""
    
    # Build target package sets
    target_system = set(SYSTEM_PACKAGES)
    target_aur = set(AUR_PACKAGES)
    
    # Add group packages if specified
    if groups:
        for group in groups:
            if group in GROUPS:
                # Determine if group packages are AUR or not
                group_name = group
                if group.endswith("-aur"):
                    target_aur.update(GROUPS[group])
                else:
                    target_system.update(GROUPS[group])
            else:
                print(f"Warning: Unknown group '{group}'")
    
    # Get current state
    installed = get_installed_packages()
    installed_aur = get_aur_packages()
    installed_official = installed - installed_aur
    
    # Calculate differences
    to_install_system = target_system - installed_official
    to_install_aur = target_aur - installed_aur
    
    # Packages to remove: installed but not in any target list
    all_targets = target_system | target_aur
    to_remove = (installed - all_targets) - set(KEEP_PACKAGES)
    
    # Filter out packages that are dependencies
    if to_remove:
        # Check which packages are required by others
        result = run(["pacman", "-Qtq"], capture=True, check=False)
        required = set(result.stdout.strip().split("\n")) if result.stdout.strip() else set()
        to_remove = to_remove - required
    
    if dry_run:
        print("=== Dry Run ===")
        if to_install_system:
            print(f"\nWould install (pacman): {', '.join(sorted(to_install_system))}")
        if to_install_aur:
            print(f"\nWould install (AUR): {', '.join(sorted(to_install_aur))}")
        if to_remove:
            print(f"\nWould remove: {', '.join(sorted(to_remove))}")
        if not (to_install_system or to_install_aur or to_remove):
            print("\nSystem is in sync!")
        return True
    
    success = True
    
    # Install system packages
    if to_install_system:
        print(f"\nInstalling system packages: {', '.join(sorted(to_install_system))}")
        if not install_packages(list(to_install_system), aur=False):
            success = False
    
    # Install AUR packages
    if to_install_aur:
        print(f"\nInstalling AUR packages: {', '.join(sorted(to_install_aur))}")
        if not install_packages(list(to_install_aur), aur=True):
            success = False
    
    # Remove orphaned packages
    if to_remove:
        print(f"\nRemoving packages: {', '.join(sorted(to_remove))}")
        if not remove_packages(list(to_remove)):
            success = False
    
    if success and not (to_install_system or to_install_aur or to_remove):
        print("System is already in sync!")
    
    return success


def cmd_sync(args):
    """Handle sync command."""
    groups = args.group if hasattr(args, 'group') and args.group else None
    return sync_packages(dry_run=args.dry_run, groups=groups)


def cmd_edit(args):
    """Handle edit command - the main workflow."""
    print("Creating pre-edit snapshot...")
    snapshot_num = create_snapshot(f"ax edit - {datetime.now().isoformat()}")
    
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
    
    # Check if there are changes
    if before_status == after_status:
        print("\nNo changes detected.")
        if snapshot_num:
            print(f"Removing snapshot {snapshot_num}...")
            delete_snapshot(snapshot_num)
        return True
    
    print("\nChanges detected:")
    run(["git", "diff", "--stat"])
    
    # Apply chezmoi changes
    print("\nApplying chezmoi changes...")
    run(["chezmoi", "apply", "--source", str(DOTFILES_DIR / "home")])
    
    # Sync packages
    print("\nSyncing packages...")
    sync_packages()
    
    # Commit changes
    print("\nCommitting changes...")
    run(["git", "add", "-A"])
    
    # Generate commit message
    commit_msg = f"ax edit - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    run(["git", "commit", "-m", commit_msg])
    
    # Ask about push
    response = input("\nPush changes to remote? [y/N] ").strip().lower()
    if response == 'y':
        run(["git", "push"])
    
    print("\nDone!")
    return True


def cmd_snapshot(args):
    """Handle snapshot command."""
    description = args.description or f"Manual snapshot - {datetime.now().isoformat()}"
    snapshot_num = create_snapshot(description)
    if snapshot_num:
        print(f"Created snapshot: {snapshot_num}")
        return True
    return False


def cmd_list(args):
    """Handle list command."""
    installed = get_installed_packages()
    installed_aur = get_aur_packages()
    installed_official = installed - installed_aur
    
    target_system = set(SYSTEM_PACKAGES)
    target_aur = set(AUR_PACKAGES)
    all_targets = target_system | target_aur
    
    print("=== Package Status ===\n")
    
    print("Declared (official):", len(target_system))
    print("Declared (AUR):", len(target_aur))
    print("Installed (explicit):", len(installed))
    print("Installed (AUR):", len(installed_aur))
    
    missing_system = target_system - installed_official
    missing_aur = target_aur - installed_aur
    extra = (installed - all_targets) - set(KEEP_PACKAGES)
    
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
    ax sync -g gaming    # Sync with gaming group
    ax edit              # Edit dotfiles workflow
    ax snapshot "test"   # Create named snapshot
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
    
    # snapshot command
    snapshot_parser = subparsers.add_parser("snapshot", help="Create a snapshot")
    snapshot_parser.add_argument("description", nargs="?", help="Snapshot description")
    snapshot_parser.set_defaults(func=cmd_snapshot)
    
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
