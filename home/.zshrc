# Zsh configuration

# History
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE

# Vi mode
bindkey -v
export KEYTIMEOUT=1

# Completion
autoload -U compinit
zstyle ':completion:*' menu select
zmodload zsh/complist
compinit
_comp_options+=(globdots)

# Use vim keys in tab complete menu
bindkey -M menuselect 'h' vi-backward-char
bindkey -M menuselect 'k' vi-up-line-or-history
bindkey -M menuselect 'l' vi-forward-char
bindkey -M menuselect 'j' vi-down-line-or-history
bindkey -v '^?' backward-delete-char

# Edit command line in editor
autoload -Uz edit-command-line
zle -N edit-command-line
bindkey '^X^E' edit-command-line

# Space expands history
bindkey ' ' magic-space

# Clipboard aliases
if command -v wl-copy &> /dev/null; then
    alias -g C='| wl-copy'
elif command -v pbcopy &> /dev/null; then
    alias -g C='| pbcopy'
elif command -v xclip &> /dev/null; then
    alias -g C='| xclip -selection clipboard'
fi

# Global aliases
alias -g NE='2>/dev/null'
alias -g NO='>/dev/null'
alias -g NUL='>/dev/null 2>&1'
alias -g J='| jq'

# Batch rename
autoload -Uz zmv

# Named directories
hash -d proj=~/Projects
hash -d dotfiles=~/.dotfiles
hash -d dl=~/Downloads

# Environment
export EDITOR="nvim"
export SUDO_EDITOR="nvim"
export PATH="$HOME/.local/bin:$PATH"

# fzf integration
if command -v fzf &> /dev/null; then
    source <(fzf --zsh)
fi

# zoxide integration
if command -v zoxide &> /dev/null; then
    eval "$(zoxide init zsh)"
fi

# oh-my-posh prompt
if command -v oh-my-posh &> /dev/null; then
    eval "$(oh-my-posh init zsh --config ~/.config/oh-my-posh/config.json)"
fi

# Useful aliases
alias ls='ls --color=auto'
alias ll='ls -la'
alias la='ls -A'
alias l='ls -CF'
alias grep='grep --color=auto'
alias vim='nvim'
alias vi='nvim'

# Git aliases
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline'
alias gd='git diff'

# Auto suggestions
if [ -f /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh ]; then
    source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
fi

# Syntax highlighting (must be at end)
if [ -f /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]; then
    source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
fi

eval "$(mise activate zsh)"
