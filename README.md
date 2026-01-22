# Arch Linux Setup Guide

This guide covers the manual setup steps required to bootstrap the system before applying dotfiles.

## Table of Contents

1. [Arch Installation with Btrfs](#arch-installation-with-btrfs)
2. [Bootloader (GRUB) Setup](#bootloader-grub-setup)
3. [Snapper Configuration](#snapper-configuration)
4. [User Setup](#user-setup)
5. [Essential Services](#essential-services)
6. [Display Manager (SDDM)](#display-manager-sddm)
7. [SOPS Secret Management](#sops-secret-management)
8. [Applying Dotfiles](#applying-dotfiles)

---

## Arch Installation with Btrfs

### Partition Layout (UEFI)

```bash
# Example for /dev/nvme0n1
gdisk /dev/nvme0n1

# Create partitions:
# 1. EFI System Partition (ESP): 512MB, type EF00
# 2. Root partition: remaining space, type 8300

mkfs.fat -F32 /dev/nvme0n1p1
mkfs.btrfs /dev/nvme0n1p2
```

### Btrfs Subvolume Layout

```bash
mount /dev/nvme0n1p2 /mnt

# Create subvolumes
btrfs subvolume create /mnt/@
btrfs subvolume create /mnt/@home
btrfs subvolume create /mnt/@snapshots
btrfs subvolume create /mnt/@var_log
btrfs subvolume create /mnt/@var_cache

umount /mnt

# Mount with recommended options
mount -o noatime,compress=zstd,space_cache=v2,subvol=@ /dev/nvme0n1p2 /mnt

mkdir -p /mnt/{boot,home,.snapshots,var/log,var/cache}

mount -o noatime,compress=zstd,space_cache=v2,subvol=@home /dev/nvme0n1p2 /mnt/home
mount -o noatime,compress=zstd,space_cache=v2,subvol=@snapshots /dev/nvme0n1p2 /mnt/.snapshots
mount -o noatime,compress=zstd,space_cache=v2,subvol=@var_log /dev/nvme0n1p2 /mnt/var/log
mount -o noatime,compress=zstd,space_cache=v2,subvol=@var_cache /dev/nvme0n1p2 /mnt/var/cache

mount /dev/nvme0n1p1 /mnt/boot
```

### Base Installation

```bash
pacstrap -K /mnt base linux linux-firmware btrfs-progs amd-ucode vim git

genfstab -U /mnt >> /mnt/etc/fstab

arch-chroot /mnt
```

---

## Bootloader (GRUB) Setup

```bash
pacman -S grub efibootmgr grub-btrfs inotify-tools

grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB

# Edit /etc/default/grub if needed
# GRUB_CMDLINE_LINUX_DEFAULT="loglevel=3 quiet"

grub-mkconfig -o /boot/grub/grub.cfg
```

### grub-btrfs for Snapshot Boot Entries

```bash
# Enable automatic grub-btrfs regeneration
systemctl enable --now grub-btrfsd
```

This will automatically add boot entries for btrfs snapshots.

---

## Snapper Configuration

```bash
pacman -S snapper snap-pac

# Create snapper config for root
snapper -c root create-config /

# The default config creates snapshots in /.snapshots
# But we want to use our @snapshots subvolume

# Remove the auto-created .snapshots subvolume
btrfs subvolume delete /.snapshots
mkdir /.snapshots
mount -o subvol=@snapshots /dev/nvme0n1p2 /.snapshots

# Add to fstab (should already be there from genfstab)
```

### Snapper Config

Edit `/etc/snapper/configs/root`:

```ini
# Limits for timeline cleanup
TIMELINE_MIN_AGE="1800"
TIMELINE_LIMIT_HOURLY="0"
TIMELINE_LIMIT_DAILY="7"
TIMELINE_LIMIT_WEEKLY="0"
TIMELINE_LIMIT_MONTHLY="0"
TIMELINE_LIMIT_YEARLY="0"

# We only want manual snapshots via ax tool
TIMELINE_CREATE="no"
```

Enable snapper cleanup timer:

```bash
systemctl enable --now snapper-cleanup.timer
```

---

## User Setup

```bash
# Set timezone
ln -sf /usr/share/zoneinfo/Europe/Warsaw /etc/localtime
hwclock --systohc

# Set locale
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
echo "pl_PL.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen
echo "LANG=en_US.UTF-8" > /etc/locale.conf

# Set keyboard
echo "KEYMAP=pl" > /etc/vconsole.conf

# Set hostname
echo "archlinux" > /etc/hostname

# Create user
useradd -m -G wheel,video,audio,input,docker -s /bin/zsh axot
passwd axot

# Enable sudo for wheel group
EDITOR=vim visudo
# Uncomment: %wheel ALL=(ALL:ALL) ALL

# Set root password
passwd
```

---

## Essential Services

```bash
pacman -S networkmanager pipewire pipewire-pulse pipewire-alsa wireplumber \
          bluez bluez-utils

systemctl enable NetworkManager
systemctl enable bluetooth
```

### AMD GPU Setup

```bash
pacman -S mesa lib32-mesa vulkan-radeon lib32-vulkan-radeon \
          libva-mesa-driver lib32-libva-mesa-driver
```

---

## Display Manager (SDDM)

```bash
pacman -S sddm

systemctl enable sddm
```

### SDDM Theme (Optional)

```bash
# Install a theme
paru -S sddm-sugar-dark

# Configure /etc/sddm.conf.d/theme.conf
[Theme]
Current=sugar-dark
```

---

## SOPS Secret Management

### Install SOPS and age

```bash
pacman -S sops age
```

### Generate age Key

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt

# Note the public key, you'll need it for .sops.yaml
```

### Create .sops.yaml in Dotfiles Root

```yaml
creation_rules:
  - path_regex: \.yaml$
    age: >-
      age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Encrypt Secrets

```bash
# Create secrets file
cat > secrets.yaml << EOF
openweather_api_key: YOUR_API_KEY_HERE
EOF

# Encrypt it
sops -e secrets.yaml > home/private_dot_config/sops/secrets.yaml
```

---

## Applying Dotfiles

### Install paru (AUR Helper)

```bash
sudo pacman -S --needed base-devel
git clone https://aur.archlinux.org/paru.git
cd paru
makepkg -si
```

### Install chezmoi

```bash
pacman -S chezmoi
```

### Initialize and Apply

```bash
# Clone dotfiles
git clone https://github.com/YOUR_USERNAME/dotfiles.git ~/Projects/dotfiles

# Initialize chezmoi with the home directory
chezmoi init --source ~/Projects/dotfiles/home

# Preview changes
chezmoi diff

# Apply
chezmoi apply
```

### Install ax Tool

```bash
cd ~/Projects/dotfiles
./ax/install.sh
```

### Sync Packages

```bash
ax sync
```

---

## Post-Installation

After rebooting, you should have:

- SDDM login screen
- Sway window manager
- Waybar status bar
- All configured applications

### First Login Checklist

1. [ ] Login via SDDM
2. [ ] Verify Sway starts correctly
3. [ ] Check waybar displays properly
4. [ ] Test terminal (Super+T for ghostty)
5. [ ] Test rofi launcher (Super+Space)
6. [ ] Run `ax sync` to install all packages
7. [ ] Verify snapshots work: `ax snapshot test`
