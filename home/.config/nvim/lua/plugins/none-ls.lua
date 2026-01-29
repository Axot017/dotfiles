return {
  "nvimtools/none-ls.nvim",
  dependencies = { "nvim-lua/plenary.nvim" },
  opts = function()
    local null_ls = require("null-ls")
    return {
      sources = {
        null_ls.builtins.code_actions.gitsigns,
        null_ls.builtins.formatting.gofmt,
        null_ls.builtins.formatting.goimports,
        null_ls.builtins.formatting.opentofu_fmt,
        null_ls.builtins.formatting.mix,
        null_ls.builtins.formatting.yamlfmt,
      },
    }
  end,
  config = function(_, opts)
    require("null-ls").setup(opts)
  end,
}
