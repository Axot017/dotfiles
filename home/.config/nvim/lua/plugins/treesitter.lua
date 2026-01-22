-- Treesitter configuration

return {
  -- Treesitter
  {
    "nvim-treesitter/nvim-treesitter",
    lazy = false,
    build = ':TSUpdate'
  },

  -- Treesitter context (sticky header)
  -- {
  --   "nvim-treesitter/nvim-treesitter-context",
  --   event = { "BufReadPost", "BufNewFile" },
  --   opts = {
  --     enable = true,
  --     max_lines = 0,
  --     min_window_height = 0,
  --     line_numbers = true,
  --     multiline_threshold = 20,
  --     trim_scope = "outer",
  --     mode = "cursor",
  --     separator = nil,
  --     zindex = 20,
  --     on_attach = nil,
  --   },
  -- },
}
