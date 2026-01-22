# Arch Linux Migration - TODO

This file tracks remaining work after the minimal setup is complete.

## Legend

- [ ] Not started
- [x] Completed
- [~] Partially done / In progress

---

## Setup & Infrastructure

- [x] Automated setup script (`setup.sh`)
  - [x] paru installation
  - [x] Snapper configuration
  - [x] grub-btrfs for snapshot boot entries
  - [x] Chezmoi dotfiles application
  - [x] ax tool installation
  - [x] Service enablement
  - [x] SOPS age key generation
- [x] Simplified README with quick start guide
- [x] AGENTS.md for coding agents

---

## Core System

### Neovim - Deferred Plugins

- [ ] LSP configuration (via devbox per-project)
  - [ ] gopls (Go)
  - [ ] lua_ls (Lua)
  - [ ] nil_ls (Nix) - may not need on Arch
  - [ ] elixir-ls (Elixir)
  - [ ] ocaml-lsp (OCaml)
  - [ ] yamlls (YAML)
  - [ ] tofu-ls (OpenTofu)
- [ ] none-ls / null-ls for formatters
  - [ ] gofmt, goimports
  - [ ] nixfmt - may not need
  - [ ] ocamlformat
  - [ ] yamlfmt
  - [ ] mix format (Elixir)
- [ ] DAP (Debug Adapter Protocol)
  - [ ] nvim-dap
  - [ ] nvim-dap-ui
  - [ ] nvim-dap-go
- [ ] neotest
  - [ ] neotest-golang
  - [ ] neotest-elixir
- [ ] gopher.nvim (Go tools)
- [ ] kulala.nvim (HTTP client) - requires custom treesitter grammar
- [ ] multiterm.nvim (your plugin)
- [ ] sidekick.nvim
- [ ] opencode-nvim

### Gaming

- [ ] Steam installation
  - [ ] Enable multilib repository
  - [ ] Install steam package
  - [ ] Install protonup-qt or protonup-ng
  - [ ] Configure Steam Play / Proton
- [ ] Gamescope
- [ ] MangoHud
- [ ] Gamemode
- [ ] Oversteer (wheel support)
  - [ ] hid-tmff2 kernel module for Thrustmaster wheels

### Virtualization

- [ ] Docker
  - [ ] Install docker package
  - [ ] Add user to docker group
  - [ ] Enable docker.service
  - [ ] Configure auto-prune
- [ ] Podman (alternative)

### Hardware

- [ ] Bluetooth
  - [ ] bluez, bluez-utils installed
  - [ ] bluetooth.service enabled
  - [ ] blueman for GUI
- [ ] AMD GPU / ROCm
  - [ ] Verify mesa/vulkan drivers
  - [ ] ROCm for compute (ollama)
  - [ ] HSA_OVERRIDE_GFX_VERSION environment variable if needed
- [ ] Sensors
  - [ ] lm_sensors package
  - [ ] nct6775 kernel module for motherboard sensors
- [ ] Printing
  - [ ] CUPS setup

### Networking

- [ ] KDE Connect alternative (gsconnect or kdeconnect)
- [ ] Firewall configuration (ufw or firewalld)

---

## Applications

### Already Configured (Minimal Setup)

- [x] Ghostty terminal
- [x] Rofi launcher
- [x] SwayNC notifications
- [x] Waybar
- [x] Neovim (basic)

### To Install via ax

- [ ] Zen Browser (AUR: zen-browser-bin)
- [ ] Discord
- [ ] Slack
- [ ] Nemo file manager
- [ ] mpv media player
- [ ] pavucontrol
- [ ] Bruno (API client)
- [ ] Beekeeper Studio (database GUI)

### Development Tools

- [ ] direnv
- [ ] devbox
- [ ] Go toolchain
- [ ] Node.js
- [ ] Python / uv
- [ ] Rust toolchain (if needed)
- [ ] AWS CLI v2

---

## Desktop Environment Polish

### Theming

- [ ] Tokyo Night GTK theme
- [ ] Rose Pine cursor theme
- [ ] Candy icons (from NixOS config)
- [ ] Sweet theme (from NixOS config)
- [ ] Qt5/Qt6 theming (qt5ct, qt6ct)
- [ ] Font configuration
  - [ ] JetBrainsMono Nerd Font
  - [ ] Roboto
  - [ ] Source Sans Pro
  - [ ] Font Awesome

### Sway Enhancements

- [ ] swww for animated wallpapers
- [ ] swww_randomize.sh script
- [ ] Screen recording
  - [ ] wl-screenrec
  - [ ] record-screen scripts
- [ ] Screenshots
  - [ ] grim + slurp (already in minimal)
  - [ ] hyprshot alternative for sway (grimshot or custom script)
- [ ] Clipboard
  - [ ] cliphist (already in minimal)
  - [ ] wl-clipboard

### Waybar Enhancements

- [ ] Add more modules as needed
- [ ] Click actions (currently some are placeholders)
- [ ] Weather API key setup via SOPS

---

## ax Tool Improvements

- [ ] Add `ax rollback` command for snapper rollback
- [ ] Add `ax list-snapshots` command
- [ ] Add `ax diff` to show package differences
- [ ] Add `ax search` for package search
- [ ] Add `ax clean` for cache cleanup
- [ ] Flatpak support (optional)
- [ ] Package groups/profiles (e.g., gaming, dev, minimal)

---

## Chezmoi Improvements

- [ ] Add templates for machine-specific config
- [ ] Add scripts for post-apply hooks
- [ ] Encrypted files for sensitive data
- [ ] External files for large binaries

---

## Documentation

- [x] Document keybindings cheatsheet (in README)
- [x] Document ax tool usage (in README)
- [x] Add troubleshooting section to README
- [ ] Screenshots of the setup

---

## Nice to Have

- [ ] Automatic theming based on wallpaper (pywal alternative)
- [ ] System monitoring dashboard
- [ ] Backup strategy for home directory
- [ ] Dotfiles encryption for private configs
- [ ] CI/CD for dotfiles (shellcheck, lint)

---

## Migration Checklist

When ready to migrate:

1. [ ] Backup current NixOS system
2. [ ] Test Arch in VM first
3. [ ] Verify all critical apps work
4. [ ] Export browser bookmarks/passwords
5. [ ] Export any app-specific data
6. [ ] Document any NixOS-specific workflows to replicate
