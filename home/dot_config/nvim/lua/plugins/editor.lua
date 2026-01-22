-- Editor plugins: oil, gitsigns, autopairs, surround

return {
  -- Oil file explorer
  {
    "stevearc/oil.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    opts = {
      default_file_explorer = true,
      columns = { "icon" },
      skip_confirm_for_simple_edits = true,
      lsp_file_methods = {
        autosave_changes = true,
      },
      view_options = {
        show_hidden = true,
      },
    },
  },

  -- Git signs in gutter
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    opts = {},
  },

  -- Auto pairs
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    opts = {},
  },

  -- Surround motions
  {
    "kylechui/nvim-surround",
    version = "*",
    event = "VeryLazy",
    opts = {},
  },
}
