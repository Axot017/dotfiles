return {
  "nvim-neotest/neotest",
  dependencies = {
    "nvim-neotest/nvim-nio",
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
    "fredrikaverpil/neotest-golang",
    "jfpedroza/neotest-elixir",
  },
  opts = function()
    return {
      adapters = {
        require("neotest-golang"),
        require("neotest-elixir"),
      },
    }
  end,
}
