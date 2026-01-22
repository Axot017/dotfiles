#!/bin/bash
#
# Arch Linux dotfiles setup script
# Run this after a fresh archinstall with btrfs
#
# This script is idempotent - safe to run multiple times
#

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Verify we're on Arch
if [[ ! -f /etc/arch-release ]]; then
    echo "This script is for Arch Linux only"
    exit 1
fi

# =============================================================================
# 1. Install paru (AUR helper)
# =============================================================================
if ! command -v paru &> /dev/null; then
    info "Installing paru..."
    sudo pacman -S --needed --noconfirm base-devel git
    PARU_TMP=$(mktemp -d)
    git clone https://aur.archlinux.org/paru.git "$PARU_TMP"
    (cd "$PARU_TMP" && makepkg -si --noconfirm)
    rm -rf "$PARU_TMP"
else
    info "paru already installed"
fi

# =============================================================================
# 2. Install grab-btrfs
# =============================================================================
info "Installing grab-btrfs"
sudo pacman -S --needed --noconfirm snap-pac grub-btrfs

# =============================================================================
# 3. Enable grub-btrfs for snapshot boot entries
# =============================================================================
if ! systemctl is-enabled grub-btrfsd &> /dev/null 2>&1; then
    info "Enabling grub-btrfs..."
    sudo systemctl enable --now grub-btrfsd
else
    info "grub-btrfs already enabled"
fi

# =============================================================================
# 4. Install stow
# =============================================================================
if ! command -v stow &> /dev/null; then
    info "Installing stow..."
    sudo pacman -S --needed --noconfirm stow
else
    info "stow already installed"
fi

# =============================================================================
# 5. Clone dotfiles
# =============================================================================
DOTFILES_DIR="$HOME/.dotfiles"
if [[ ! -d "$DOTFILES_DIR" ]]; then
    info "Cloning dotfiles..."
    git clone https://github.com/Axot017/dotfiles "$DOTFILES_DIR"
else
    info "Dotfiles already cloned"
fi

# =============================================================================
# 6. Apply dotfiles with stow
# =============================================================================
if [[ ! -d "$HOME/.config/sway" ]]; then
    info "Applying dotfiles with stow..."
    cd "$DOTFILES_DIR"
    stow -v -t ~ home
else
    info "Dotfiles already applied (restowing...)"
    cd "$DOTFILES_DIR"
    stow -R -t ~ home
fi

# =============================================================================
# 7. Install zsh and set as default shell
# =============================================================================
if ! command -v zsh &> /dev/null; then
    info "Installing zsh..."
    sudo pacman -S --needed --noconfirm zsh
fi

if [[ "$SHELL" != */zsh ]]; then
    info "Setting zsh as default shell..."
    sudo usermod -s "$(which zsh)" "$USER"
else
    info "zsh already set as default shell"
fi

# =============================================================================
# 8. Sync packages with ax
# =============================================================================
info "Syncing packages..."
export PATH="$HOME/.config/bin:$PATH"
ax sync

# =============================================================================
# 9. Import SSH keys from Bitwarden
# =============================================================================
SSH_DIR="$HOME/.ssh"
SSH_PRIVATE="$SSH_DIR/id_ed25519"
SSH_PUBLIC="$SSH_DIR/id_ed25519.pub"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [[ -f "$SSH_PRIVATE" ]]; then
    info "SSH keys already exist, skipping Bitwarden import"
else
    info "Importing SSH keys from Bitwarden..."
    
    # Login to Bitwarden (will prompt for credentials)
    # Use /dev/tty to ensure interactive input works inside scripts
    if ! bw login --check &> /dev/null; then
        BW_SESSION=$(bw login --raw < /dev/tty)
    else
        BW_SESSION=$(bw unlock --raw < /dev/tty)
    fi
    export BW_SESSION
    
    # Get the SSH key item
    SSH_ITEM=$(bw get item "GitHub SSH")
    
    # Extract and save keys
    echo "$SSH_ITEM" | jq -r '.sshKey.privateKey' > "$SSH_PRIVATE"
    echo "$SSH_ITEM" | jq -r '.sshKey.publicKey' > "$SSH_PUBLIC"
    
    # Set proper permissions
    chmod 600 "$SSH_PRIVATE"
    chmod 644 "$SSH_PUBLIC"

    AGE_KEY_ITEM=$(bw get item "Homelab - age key")

    mkdir -p "$HOME/.config/age"

    echo "$AGE_KEY_ITEM" | jq -r '.notes' > "$HOME/.config/age/keys.txt"

    chmod 600 "$HOME/.config/age/keys.txt"
    
    # Lock vault
    bw lock
    
    info "SSH keys imported successfully"
fi

# =============================================================================
# 10. Enable system services
# =============================================================================
info "Enabling services..."

# Display manager
if ! systemctl is-enabled sddm &> /dev/null 2>&1; then
    sudo systemctl enable sddm
fi

# Bluetooth
if ! systemctl is-enabled bluetooth &> /dev/null 2>&1; then
    sudo systemctl enable bluetooth
fi

# Network
if ! systemctl is-enabled NetworkManager &> /dev/null 2>&1; then
    sudo systemctl enable NetworkManager
fi

# =============================================================================
# 11. Create common directories
# =============================================================================
mkdir -p "$HOME/Pictures/Screenshots"
mkdir -p "$HOME/Videos/ScreenRecordings"
mkdir -p "$HOME/Projects"

# =============================================================================
# Done!
# =============================================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
