local augroup = vim.api.nvim_create_augroup("UserConfig", { clear = true })

-- Format on save (when LSP is available)
vim.api.nvim_create_autocmd("BufWritePre", {
  group = augroup,
  callback = function()
    -- Only format if there's an active LSP client with formatting capability
    local clients = vim.lsp.get_clients({ bufnr = 0 })
    for _, client in ipairs(clients) do
      if client.supports_method("textDocument/formatting") then
        vim.lsp.buf.format({ async = false })
        return
      end
    end
  end,
})

-- Oil rename integration with Snacks
vim.api.nvim_create_autocmd("User", {
  group = augroup,
  pattern = "OilActionsPost",
  callback = function(event)
    if event.data.actions.type == "move" then
      if package.loaded["snacks"] then
        Snacks.rename.on_rename_file(event.data.actions.src_url, event.data.actions.dest_url)
      end
    end
  end,
})

-- Highlight on yank
vim.api.nvim_create_autocmd("TextYankPost", {
  group = augroup,
  callback = function()
    vim.highlight.on_yank({ higroup = "IncSearch", timeout = 200 })
  end,
})

-- Auto close some filetypes with q
vim.api.nvim_create_autocmd("FileType", {
  group = augroup,
  pattern = { "help", "qf", "man", "lspinfo", "notify" },
  callback = function(event)
    vim.bo[event.buf].buflisted = false
    vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = event.buf, silent = true })
  end,
})


vim.api.nvim_create_autocmd('FileType', {
  callback = function() 
    vim.treesitter.start() 

    vim.wo[0][0].foldexpr = 'v:lua.vim.treesitter.foldexpr()'
    vim.wo[0][0].foldmethod = 'expr'

    vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
  end,
})
