-- Keymaps for Neovim
-- Note: Plugin-specific keymaps that require the plugin to be loaded
-- are defined in the plugin spec files

local map = vim.keymap.set

-- Oil file explorer
map("n", "<C-n>", "<cmd>Oil<CR>", { silent = true, desc = "Open Oil" })

-- Window navigation
map("n", "<C-h>", "<C-w>h", { silent = true, desc = "Go to left window" })
map("n", "<C-j>", "<C-w>j", { silent = true, desc = "Go to lower window" })
map("n", "<C-k>", "<C-w>k", { silent = true, desc = "Go to upper window" })
map("n", "<C-l>", "<C-w>l", { silent = true, desc = "Go to right window" })

-- Window resizing
map("n", "<S-Up>", "<cmd>resize +2<CR>", { silent = true, desc = "Increase window height" })
map("n", "<S-Down>", "<cmd>resize -2<CR>", { silent = true, desc = "Decrease window height" })
map("n", "<S-Left>", "<cmd>vertical resize -2<CR>", { silent = true, desc = "Decrease window width" })
map("n", "<S-Right>", "<cmd>vertical resize +2<CR>", { silent = true, desc = "Increase window width" })

-- Clipboard
map({ "n", "v", "x" }, "<C-y>", '"+y', { silent = true, desc = "Yank to system clipboard" })
map({ "n", "v", "x" }, "<C-p>", '"+p', { silent = true, desc = "Paste from system clipboard" })

-- Movement
map("n", "<ESC>", "<cmd>noh<CR>", { silent = true, desc = "Clear search highlight" })
map("n", "<C-d>", "<C-d>zz", { silent = true, desc = "Scroll down and center" })
map("n", "<C-u>", "<C-u>zz", { silent = true, desc = "Scroll up and center" })
map("n", "n", "nzz", { silent = true, desc = "Next search result and center" })
map("n", "N", "Nzz", { silent = true, desc = "Previous search result and center" })

-- Buffers (bufferline keymaps)
map("n", "<S-h>", "<cmd>BufferLineCyclePrev<CR>", { silent = true, desc = "Previous buffer" })
map("n", "<S-l>", "<cmd>BufferLineCycleNext<CR>", { silent = true, desc = "Next buffer" })

-- Buffer delete (snacks)
map("n", "<leader>x", function()
  if package.loaded["snacks"] then
    Snacks.bufdelete()
  else
    vim.cmd("bdelete")
  end
end, { silent = true, desc = "Delete buffer" })

map("n", "<leader>X", function()
  if package.loaded["snacks"] then
    Snacks.bufdelete.other()
  end
end, { silent = true, desc = "Delete other buffers" })

-- Snacks picker
map("n", "<leader>ff", function() Snacks.picker.files() end, { silent = true, desc = "Find files" })
map("n", "<leader>fr", function() Snacks.picker.recent() end, { silent = true, desc = "Recent files" })
map("n", "<leader>fg", function() Snacks.picker.grep() end, { silent = true, desc = "Live grep" })
map("n", "<leader>fd", function() Snacks.picker.diagnostics() end, { silent = true, desc = "Diagnostics" })
map("n", "<leader>gb", function() Snacks.picker.git_branches() end, { silent = true, desc = "Git branches" })
map("n", "<leader>gs", function() Snacks.picker.git_status() end, { silent = true, desc = "Git status" })
map("n", "<leader>gd", function() Snacks.picker.git_diff() end, { silent = true, desc = "Git diff" })

-- LSP keymaps (will work when LSP is configured via devbox)
map("n", "gi", function() Snacks.picker.lsp_implementations() end, { silent = true, desc = "Go to implementations" })
map("n", "gd", function() Snacks.picker.lsp_definitions() end, { silent = true, desc = "Go to definitions" })
map("n", "gr", function() Snacks.picker.lsp_references() end, { silent = true, desc = "Go to references" })
map("n", "<leader>r", function() vim.lsp.buf.rename() end, { silent = true, desc = "LSP rename" })
map("n", "<leader>ca", function() vim.lsp.buf.code_action() end, { silent = true, desc = "LSP code action" })
map("n", "]d", function() vim.diagnostic.jump({ count = 1, float = true }) end, { silent = true, desc = "Next diagnostic" })
map("n", "[d", function() vim.diagnostic.jump({ count = -1, float = true }) end, { silent = true, desc = "Previous diagnostic" })

-- Terminal mode
map("t", "<esc><esc>", "<C-\\><C-n>", { silent = true, desc = "Exit terminal mode" })
