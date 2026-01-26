return {
  "folke/snacks.nvim",
  priority = 1000,
  lazy = false,
  opts = {
    bigfile = { enabled = true },
    bufdelete = { enabled = true },
    indent = { enabled = true },
    input = { enabled = true },
    notifier = { enabled = true },
    rename = { enabled = true },
    scope = { enabled = true },
    words = { enabled = true },
    terminal = { enabled = true },
    picker = {
      enabled = true,
      matcher = {
        fuzzy = true,
        smartcase = true,
        file_pos = true,
        cwd_bonus = true,
        frecency = true,
        history_bonus = true,
      },
      layout = { preset = "ivy" },
    },
  },
  init = function()
    -- Make Snacks global for easy access in keymaps
    vim.api.nvim_create_autocmd("User", {
      pattern = "VeryLazy",
      callback = function()
        -- Global helper
        _G.Snacks = require("snacks")
      end,
    })
  end,
}
