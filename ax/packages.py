"""
Declarative package definitions for Arch Linux.

This file defines all packages that should be installed on the system.
The ax tool reads these lists and ensures the system matches this state.
"""

# Core system packages (pacman)
SYSTEM_PACKAGES = [
    # Base
    "base-devel",
    "git",
    "vim",
    "neovim",
    
    # Filesystem
    "btrfs-progs",
    "snapper",
    "snap-pac",
    
    # Boot
    "grub",
    "efibootmgr",
    "grub-btrfs",
    
    # Shell
    "zsh",
    "zsh-completions",
    "zsh-autosuggestions",
    "zsh-syntax-highlighting",
    "fzf",
    
    # Terminal
    "ghostty",
    
    # Wayland / Sway
    "sway",
    "swaylock",
    "swayidle",
    "waybar",
    "rofi-wayland",
    "swaync",
    "grim",
    "slurp",
    "wl-clipboard",
    "cliphist",
    
    # Display Manager
    "sddm",
    
    # Audio
    "pipewire",
    "pipewire-pulse",
    "pipewire-alsa",
    "wireplumber",
    "pavucontrol",
    
    # Bluetooth
    "bluez",
    "bluez-utils",
    "blueman",
    
    # Network
    "networkmanager",
    "nm-connection-editor",
    
    # Fonts
    "ttf-jetbrains-mono-nerd",
    "ttf-roboto",
    "ttf-font-awesome",
    "noto-fonts",
    "noto-fonts-emoji",
    
    # Graphics (AMD)
    "mesa",
    "lib32-mesa",
    "vulkan-radeon",
    "lib32-vulkan-radeon",
    "libva-mesa-driver",
    
    # Utilities
    "ripgrep",
    "fd",
    "jq",
    "unzip",
    "unrar",
    "htop",
    "lm_sensors",
    "man-db",
    "man-pages",
    
    # File manager
    "nemo",
    "yazi",
    
    # Media
    "mpv",
    "ffmpeg",
    
    # Development
    "cmake",
    "ninja",
    "clang",
    "pkg-config",
    "python",
    "python-pip",
    
    # Secrets
    "sops",
    "age",
    
    # Chezmoi
    "chezmoi",
    
    # Notifications
    "libnotify",
    
    # Misc
    "curl",
    "wget",
    "inotify-tools",
]

# AUR packages (paru)
AUR_PACKAGES = [
    # Prompt
    "oh-my-posh-bin",
    
    # Browser
    "zen-browser-bin",
    
    # Communication
    "discord",
    "slack-desktop",
    
    # Development
    "devbox-bin",
    
    # Database
    "beekeeper-studio-bin",
    
    # API Client
    "bruno-bin",
    
    # Theming
    "rose-pine-cursor",
    
    # Navigation
    "zoxide-bin",
]

# Packages to explicitly ignore during orphan removal
# These might be pulled in as optional deps but we want to keep them
KEEP_PACKAGES = [
    "lib32-mesa",
    "lib32-vulkan-radeon",
]

# Package groups - can be used with `ax sync --group gaming`
GROUPS = {
    "gaming": [
        "steam",
        "gamescope",
        "mangohud",
        "lib32-mangohud",
        "gamemode",
        "lib32-gamemode",
    ],
    "gaming-aur": [
        "protonup-qt",
    ],
    "docker": [
        "docker",
        "docker-compose",
    ],
}
