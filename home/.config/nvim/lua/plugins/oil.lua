return {
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
}
