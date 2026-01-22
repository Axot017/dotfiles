# AGENTS.md - Coding Agent Guidelines

This document provides guidelines for AI coding agents working in this dotfiles repository.

## Repository Overview

This is a **dotfiles repository** for Arch Linux (migrated from NixOS). It contains:

- **`home/`** - Stow-managed dotfiles (symlinked to `~/.config/`, `~/.local/`, etc.)
- **`ax/`** - Custom Python tool for declarative package management + btrfs snapshots
- **`nix-config/`** - Legacy NixOS configuration (kept for reference)
- **`PLAN.md`** - Active TODO list for migration work
- **`README.md`** - Manual setup instructions for Arch installation

## Working with PLAN.md

The `PLAN.md` file is the **primary task tracker** for this repository. When working on tasks:

1. **Check PLAN.md first** - See what's already planned and what's completed
2. **Update status** - Mark items `[x]` when complete, `[~]` when in progress
3. **Add new items** - If you discover new work needed, add it to the appropriate section
4. **Keep it organized** - Items are grouped by category (Neovim, Gaming, Hardware, etc.)

### PLAN.md Sections
- **Core System** - LSP, DAP, formatters (managed via devbox per-project)
- **Gaming** - Steam, Gamescope, MangoHud setup
- **Virtualization** - Docker, Podman
- **Hardware** - Bluetooth, AMD GPU, sensors
- **Applications** - Browser, communication apps, dev tools
- **Desktop Polish** - Theming, wallpapers, screen recording

## Directory Structure Rationale

### `home/` - Stow Package Directory

GNU Stow creates symlinks from this directory to `$HOME`. The directory structure mirrors the target:
- `.config/` → symlinked to `~/.config/`
- `.local/` → symlinked to `~/.local/`
- `.zshrc` → symlinked to `~/.zshrc`
- Files use their actual names (no prefixes needed)

**Stow commands:**
```bash
cd ~/.dotfiles
stow -t ~ home       # Apply (create symlinks)
stow -R -t ~ home    # Restow (re-apply after changes)
stow -D -t ~ home    # Unstow (remove symlinks)
```

### `ax/` - Package Manager Tool

The `ax` tool provides NixOS-like declarative package management:
- `packages.py` - Edit this to add/remove packages
- `ax.py` - Main tool (don't modify unless adding features)
- Commands: `ax sync`, `ax edit`, `ax snapshot`, `ax list`, `ax check`

## Code Style Guidelines

### Python (ax tool)

```python
# Imports: stdlib first, then local
import argparse
import subprocess
from pathlib import Path

from packages import SYSTEM_PACKAGES

# Type hints required
def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Docstring required for public functions."""
    pass

# Constants: UPPER_SNAKE_CASE
DOTFILES_DIR = Path.home() / "Projects" / "dotfiles"

# Functions: snake_case, verb-first naming
def get_installed_packages() -> set[str]:
    pass

def sync_packages(dry_run: bool = False) -> bool:
    pass

# Error handling: use try/except, return bool for success/failure
try:
    run_sudo(["pacman", "-S", package])
    return True
except subprocess.CalledProcessError:
    return False
```

### Lua (Neovim config)

```lua
-- Use local variables
local map = vim.keymap.set

-- Plugin specs use lazy.nvim format
return {
  {
    "plugin/name",
    event = "VeryLazy",  -- Lazy loading preferred
    opts = {},           -- Use opts table when possible
    config = function(_, opts)
      require("plugin").setup(opts)
    end,
  },
}

-- Keymaps include description
map("n", "<leader>ff", function() Snacks.picker.files() end, 
    { silent = true, desc = "Find files" })
```

### Shell Scripts

```bash
#!/bin/bash
set -e  # Exit on error

# Use $() instead of backticks
result=$(command)

# Quote variables
echo "$variable"

# Use [[ ]] for conditionals
if [[ -f "$file" ]]; then
    # ...
fi
```

### Nix (legacy reference only)

```nix
# Attribute sets with consistent formatting
{
  programs.zsh = {
    enable = true;
    syntaxHighlighting.enable = true;
  };
}
```

## Build/Test Commands

### No Traditional Build System

This is a dotfiles repo - there's no compilation step. Instead:

```bash
# Validate Python syntax
python3 -m py_compile ax/ax.py

# Check shell scripts
shellcheck home/.config/waybar/scripts/*.sh

# Test ax tool (dry-run)
python3 ax/ax.py check
python3 ax/ax.py sync --dry-run

# Apply dotfiles (on Arch system)
cd ~/.dotfiles
stow -R -t ~ home

# Validate Lua syntax (requires luacheck)
luacheck home/.config/nvim/
```

### Testing Neovim Config

```bash
# Start nvim with minimal config to test
nvim --clean -u home/.config/nvim/init.lua

# Check for Lua errors
nvim --headless -c "lua require('config')" -c "qa"
```

## Common Tasks

### Adding a New Package

1. Edit `ax/packages.py`
2. Add to `SYSTEM_PACKAGES` (official) or `AUR_PACKAGES`
3. Run `ax sync` (or `ax sync --dry-run` to preview)

### Adding a New Neovim Plugin

1. Create or edit file in `home/.config/nvim/lua/plugins/`
2. Use lazy.nvim spec format
3. Add keymaps with descriptions
4. Test with `nvim --clean -u home/.config/nvim/init.lua`

### Adding a New Config File

1. Place in `home/.config/<app>/`
2. Use actual file/directory names (stow mirrors the structure to `$HOME`)
3. For scripts, ensure executable bit is set: `chmod +x <file>`
4. Update `PLAN.md` if this completes a planned item

## Important Notes

- **Don't modify `nix-config/`** - It's kept for reference only
- **LSP/dev tools** are managed per-project via devbox, not globally
- **Secrets** use SOPS with age encryption
- **Wallpapers** are in `home/.local/share/wallpapers/` (symlinked to `~/.local/share/wallpapers/`)
- **Weather API** requires OpenWeatherMap key in `~/.config/sops/secrets.yaml`

## File Locations Quick Reference

| What | Where |
|------|-------|
| Package lists | `ax/packages.py` |
| Sway config | `home/.config/sway/config` |
| Waybar | `home/.config/waybar/` |
| Neovim | `home/.config/nvim/` |
| Zsh config | `home/.zshrc` |
| Oh-my-posh | `home/.config/oh-my-posh/config.json` |
| Ghostty | `home/.config/ghostty/` |
| Rofi | `home/.config/rofi/` |
| Notifications | `home/.config/swaync/` |
