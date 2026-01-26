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
    "wpa_supplicant",
    "curl",
    "wget",
    "inotify-tools",

    "neovim",
    "tree-sitter-cli",
    
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
    "zoxide",
    
    # Terminal
    "ghostty",
    
    # Wayland / Sway
    "sway",
    "swaybg",
    "swaylock",
    "swayidle",
    "waybar",
    "rofi",
    "swaync",
    "grim",
    "slurp",
    "wl-clipboard",
    "cliphist",
    
    # Display Manager
    "sddm",
    # "qt5-graphicaleffects",
    # "qt5-quickcontrols2",
    # "qt5-svg",
    
    # Audio
    "pipewire",
    "pipewire-pulse",
    "pipewire-alsa",
    "wireplumber",
    "pavucontrol",
    "gst-plugin-pipewire",
    "libpulse",
    "pipewire-jack",
    
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
    "woff2-font-awesome",
    "noto-fonts",
    "noto-fonts-emoji",
    
    # Graphics (AMD)
    "mesa",
    "vulkan-radeon",
    
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
    "ffmpeg",
    
    # Dotfiles manager
    "stow",
    
    # Secrets
    "bitwarden-cli",

    "discord",
]

# AUR packages (paru)
AUR_PACKAGES = [
    "oh-my-posh-bin",

    "zen-browser-bin",

    "opencode-bin",
]

# Packages to explicitly ignore during orphan removal
# These might be pulled in as optional deps but we want to keep them
KEEP_PACKAGES = [
    "linux",
    "linux-firmware",
    "sudo",
]
