# Arch Linux Dotfiles

Personal dotfiles for Arch Linux with Sway, managed by GNU Stow and the custom `ax` tool.

## Quick Start

### 1. Install Arch with archinstall

Boot the Arch ISO and run `archinstall` with these settings:

| Setting | Value |
|---------|-------|
| **Disk layout** | btrfs with subvolumes and snapper |
| **Bootloader** | GRUB |
| **Profile** | Minimal |
| **Audio** | pipewire |
| **Network** | NetworkManager |
| **User** | Create your user with sudo privileges |

### 2. Clone and Run Setup

After rebooting into your new system:

```bash
curl -fsSL https://raw.githubusercontent.com/Axot017/dotfiles/main/setup.sh | bash
```

### 3. Reboot

```bash
reboot
```

SDDM will start automatically. Login and enjoy Sway!

## What setup.sh Does

The setup script is idempotent (safe to run multiple times) and handles:

- Installs paru (AUR helper)
- Enables grub-btrfs for snapshot boot entries
- Applies dotfiles via stow
- Syncs all declared packages
- Enables system services (sddm, bluetooth, NetworkManager)

## Post-Setup (Optional)

### Weather Widget

To enable the weather widget in waybar:

```bash
# Edit secrets file
cp ~/.config/sops/secrets.yaml.example ~/.config/sops/secrets.yaml
# Add your OpenWeatherMap API key

# Encrypt with sops
sops -e -i ~/.config/sops/secrets.yaml
```

### Docker

```bash
ax sync -g docker
sudo usermod -aG docker $USER
# Logout and login for group to take effect
```

## Tools

### ax - Package Manager

Declarative package management with btrfs snapshot integration:

```bash
ax sync              # Sync packages with packages.py
ax sync --dry-run    # Preview changes
ax edit              # Edit dotfiles workflow (snapshot → edit → apply → commit)
ax list              # Show package status
ax snapshot "desc"   # Create manual snapshot
```

### stow - Dotfiles

```bash
cd ~/.dotfiles
stow --no-folding -t ~ home           # Apply dotfiles (creates symlinks)
stow -D -t ~ home                     # Unstow (remove symlinks)
```

## Directory Structure

```
dotfiles/
├── setup.sh              # Automated setup script
├── ax/                   # Package manager tool
│   ├── ax.py
│   └── packages.py       # Declare packages here
├── home/                 # Stow package (symlinked to $HOME)
│   ├── .config/          # → ~/.config/
│   │   ├── sway/
│   │   ├── waybar/
│   │   ├── nvim/
│   │   └── ...
│   ├── .local/           # → ~/.local/
│   │   ├── bin/
│   │   └── share/
│   ├── .zshrc            # → ~/.zshrc
│   └── .gitconfig        # → ~/.gitconfig
└── nix-config/           # Legacy NixOS config (reference)
```

